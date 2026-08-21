import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { cleanInput, requireUser, requirePhoneVerified } from "./lib/session";
import { isDuplicatePhone, validatePhone } from "./lib/alertLogic";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";
import { dispatchTestMessage } from "./services/notify";
import { linkRegisteredContact } from "./relationships";

const MAX_CONTACTS = 10;
const VALID_CHANNELS = ["sms", "email", "push"] as const;

export const contactChannelValidator = v.union(
  v.literal("sms"),
  v.literal("email"),
  v.literal("push"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const contacts = await ctx.db
      .query("emergencyContacts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return contacts.sort((a, b) => a.priority - b.priority);
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    relationship: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
    image: v.optional(v.string()),
    active: v.optional(v.boolean()),
    channels: v.optional(v.array(contactChannelValidator)),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePhoneVerified(ctx);

    const name = cleanInput(args.name, 80);
    const relationship = cleanInput(args.relationship, 40);
    const email = cleanInput(args.email, 120);
    if (!name || !relationship) {
      throw new ConvexError("Name and relationship are required.");
    }

    const phoneCheck = validatePhone(args.phone);
    if (!phoneCheck.ok) {
      throw new ConvexError(phoneCheck.reason ?? "Invalid phone number.");
    }
    const phone = phoneCheck.normalized;

    const existing = await ctx.db
      .query("emergencyContacts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    if (existing.length >= MAX_CONTACTS) {
      throw new ConvexError(
        `You can store up to ${MAX_CONTACTS} emergency contacts. Remove or reactivate one first.`,
      );
    }
    const active = args.active !== false;

    if (isDuplicatePhone(existing, phone)) {
      throw new ConvexError("A contact with this phone number already exists.");
    }

    const priority = existing.length === 0 ? 1 : Math.max(...existing.map((c) => c.priority)) + 1;
    const isPrimary = Boolean(args.isPrimary) || existing.length === 0;

    if (isPrimary) {
      for (const c of existing) {
        if (c.isPrimary) await ctx.db.patch(c._id, { isPrimary: false });
      }
    }

    const channels = args.channels && args.channels.length > 0 ? [...new Set(args.channels)] : undefined;

    const id = await ctx.db.insert("emergencyContacts", {
      userId,
      name,
      relationship,
      phone,
      email: email ?? undefined,
      priority,
      isPrimary,
      active,
      channels,
      image: args.image ? cleanInput(args.image, 500) : undefined,
    });

    // App-to-app pairing: if the phone/email matches a registered EAlert
    // account, open a pending relationship (verified only after ACCEPT).
    await linkRegisteredContact(ctx, {
      userId,
      contactId: id,
      contactName: name,
      phone,
      email,
    });

    await logActivity(ctx, {
      userId,
      action: "contact_added",
      result: "success",
      metadata: JSON.stringify({ name, relationship }),
    });
    await createNotification(ctx, {
      userId,
      type: "contact",
      title: `${name} added`,
      body: `${name} (${relationship}) is now one of your emergency contacts.`,
      linkTo: "/contacts",
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("emergencyContacts"),
    name: v.optional(v.string()),
    relationship: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
    channels: v.optional(v.array(contactChannelValidator)),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.userId !== userId) {
      throw new ConvexError("Contact not found.");
    }

    const patch: Record<string, unknown> = {};
    const name = cleanInput(args.name, 80);
    const relationship = cleanInput(args.relationship, 40);
    const email = cleanInput(args.email, 120);
    if (name !== undefined) patch.name = name;
    if (relationship !== undefined) patch.relationship = relationship;
    if (email !== undefined) patch.email = email;
    if (args.image !== undefined) patch.image = cleanInput(args.image, 500);
    if (args.channels !== undefined) {
      patch.channels = args.channels.length > 0 ? [...new Set(args.channels)] : undefined;
    }

    // Phone: validate + prevent duplicates (ignoring the contact itself).
    if (args.phone !== undefined) {
      const phoneCheck = validatePhone(args.phone);
      if (!phoneCheck.ok) {
        throw new ConvexError(phoneCheck.reason ?? "Invalid phone number.");
      }
      const others = await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const rest = others.filter((c) => c._id !== args.id);
      if (isDuplicatePhone(rest, phoneCheck.normalized)) {
        throw new ConvexError("A contact with this phone number already exists.");
      }
      patch.phone = phoneCheck.normalized;

      // Re-link the app pairing if the phone changed.
      const linked = await linkRegisteredContact(ctx, {
        userId,
        contactId: args.id,
        contactName: contact.name,
        phone: phoneCheck.normalized,
        email: args.email,
      });
      if (!linked.registered) {
        patch.contactUserId = undefined;
        patch.verified = false;
        patch.relationshipId = undefined;
      }
    }

    // Active toggle: enforce the 10-active-contact cap when enabling.
    if (args.active === true && contact.active === false) {
      const all = await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const activeCount = all.filter((c) => c._id !== args.id && c.active !== false).length;
      if (activeCount >= MAX_CONTACTS) {
        throw new ConvexError(`You can keep up to ${MAX_CONTACTS} active emergency contacts.`);
      }
      patch.active = true;
    } else if (args.active === false) {
      patch.active = false;
    }

    if (args.isPrimary === true && !contact.isPrimary) {
      const others = await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      for (const c of others) {
        if (c.isPrimary) await ctx.db.patch(c._id, { isPrimary: false });
      }
      patch.isPrimary = true;
    } else if (args.isPrimary === false && contact.isPrimary) {
      patch.isPrimary = false;
    }

    await ctx.db.patch(args.id, patch);
    await logActivity(ctx, {
      userId,
      action: "contact_updated",
      result: "success",
      metadata: JSON.stringify({ id: args.id }),
    });
    return true;
  },
});

export const remove = mutation({
  args: { id: v.id("emergencyContacts") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.userId !== userId) {
      throw new ConvexError("Contact not found.");
    }

    await ctx.db.delete(args.id);
    await logActivity(ctx, {
      userId,
      action: "contact_removed",
      result: "success",
      metadata: JSON.stringify({ name: contact.name }),
    });

    // Re-index priorities so the list stays gapless.
    const remaining = (
      await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    ).sort((a, b) => a.priority - b.priority);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].priority !== i + 1) {
        await ctx.db.patch(remaining[i]._id, { priority: i + 1 });
      }
    }

    // If the primary was removed, promote the first remaining contact.
    if (contact.isPrimary && remaining.length > 0) {
      await ctx.db.patch(remaining[0]._id, { isPrimary: true });
    }
    return true;
  },
});

export const setPrimary = mutation({
  args: { id: v.id("emergencyContacts") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.userId !== userId) {
      throw new ConvexError("Contact not found.");
    }

    const others = await ctx.db
      .query("emergencyContacts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const c of others) {
      if (c.isPrimary) await ctx.db.patch(c._id, { isPrimary: false });
    }
    await ctx.db.patch(args.id, { isPrimary: true });
    await logActivity(ctx, {
      userId,
      action: "contact_primary",
      result: "success",
      metadata: JSON.stringify({ name: contact.name }),
    });
    return true;
  },
});

/**
 * Send a test notification to one contact through their configured
 * channels. Honest result: if no provider is configured, the test reports
 * `provider_not_configured` instead of pretending it was delivered.
 */
export const sendTest = mutation({
  args: { id: v.id("emergencyContacts") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.userId !== userId) {
      throw new ConvexError("Contact not found.");
    }

    const outcome = await dispatchTestMessage(ctx, {
      userName: user.name ?? "an EAlert user",
      recipient: {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        channels: (contact.channels ?? (contact.email ? ["sms", "email"] : ["sms"])) as (
          | "sms"
          | "email"
          | "push"
        )[],
      },
    });

    await logActivity(ctx, {
      userId,
      action: "test_notification",
      result: outcome.status === "failed" ? "failed" : "success",
      metadata: JSON.stringify({
        contactName: contact.name,
        status: outcome.status,
        error: outcome.error,
      }),
    });

    return outcome;
  },
});

/** Swap priority with the neighbor above (direction "up") or below ("down"). */
export const movePriority = mutation({
  args: { id: v.id("emergencyContacts"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.userId !== userId) {
      throw new ConvexError("Contact not found.");
    }

    const all = (
      await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    ).sort((a, b) => a.priority - b.priority);

    const index = all.findIndex((c) => c._id === args.id);
    const swapIndex = args.direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= all.length) return false;

    const other = all[swapIndex];
    const ownPriority = contact.priority;
    await ctx.db.patch(contact._id, { priority: other.priority });
    await ctx.db.patch(other._id, { priority: ownPriority });
    return true;
  },
});
