import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/session";
import { canonicalPhone } from "./lib/alertLogic";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";

/* ------------------------------------------------------------------ */
/* Registered-user lookup (privacy-preserving)                         */
/* ------------------------------------------------------------------ */

/**
 * When several accounts share one identifier (e.g. a duplicate sign-up),
 * pick the one most likely to be the person's active account: most recent
 * login first, then most recently created. Old abandoned accounts win only
 * if they are the only match.
 */
function pickBestAccount<T extends { lastLoginAt?: number; _creationTime: number }>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const aLogin = a.lastLoginAt ?? -Infinity;
    const bLogin = b.lastLoginAt ?? -Infinity;
    if (aLogin !== bLogin) return bLogin - aLogin;
    return b._creationTime - a._creationTime;
  })[0];
}

/**
 * Find a registered EAlert account by normalized phone or email.
 * Returns only what the caller already supplied (id) plus the public name
 * used for the invitation — never private profile data.
 *
 * Phone matching compares bare digits on both sides so formatting (a
 * leading "+", spaces, dashes, country-code style) can never hide a
 * registered account in one direction but not the other. When several
 * accounts share an identifier, the active one is preferred (see
 * pickBestAccount) so invites land on the account the person actually
 * uses, not an abandoned duplicate.
 */
export async function findRegisteredUser(
  ctx: { db: QueryCtx["db"] },
  opts: { phone?: string; email?: string },
): Promise<{ _id: Id<"users">; name?: string } | null> {
  if (opts.phone) {
    const phone = canonicalPhone(opts.phone);
    if (phone) {
      // Fast path: exact match against the stored canonical form.
      let candidates = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("phone"), phone))
        .collect();

      // Fallback: legacy rows may hold "+…", spaces or dashes (account
      // phones were stored raw before write-side normalization). Compare
      // digits only so a formatting difference can't hide the account.
      if (candidates.length === 0) {
        const all = await ctx.db.query("users").collect();
        candidates = all.filter(
          (u) => u.phone !== undefined && u.phone.replace(/\D/g, "") === phone,
        );
      }

      const best = pickBestAccount(candidates);
      if (best) return { _id: best._id, name: best.name };
    }
  }
  if (opts.email) {
    const email = opts.email.trim().toLowerCase();
    if (email) {
      const candidates = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .collect();
      const best = pickBestAccount(candidates);
      if (best) return { _id: best._id, name: best.name };
    }
  }
  return null;
}

/**
 * Internal helper — link an emergency contact to a registered EAlert
 * account and open a pending relationship. Caller (emergencyContacts) owns
 * the emergencyContact row; we own the relationship + notification.
 */
export async function linkRegisteredContact(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    contactId: Id<"emergencyContacts">;
    contactName: string;
    phone?: string;
    email?: string;
  },
): Promise<{ registered: boolean; relationshipId?: Id<"contactRelationships">; status?: "pending" | "verified" | "declined" }> {
  const matched = await findRegisteredUser(ctx, { phone: args.phone, email: args.email });
  if (!matched) return { registered: false };
  if (matched._id === args.userId) return { registered: false }; // never self-link

  const existing = await ctx.db
    .query("contactRelationships")
    .withIndex("by_pair", (q) => q.eq("userId", args.userId).eq("contactUserId", matched._id))
    .first();

  let relationshipId: Id<"contactRelationships">;
  let status: "pending" | "verified" | "declined" = "pending";

  if (existing) {
    relationshipId = existing._id;
    status = existing.status;
    if (existing.status === "declined") {
      // Re-invite — allow the requester to try again.
      await ctx.db.patch(existing._id, { status: "pending", invitedAt: Date.now() });
      status = "pending";
    }
  } else {
    relationshipId = await ctx.db.insert("contactRelationships", {
      userId: args.userId,
      contactUserId: matched._id,
      emergencyContactId: args.contactId,
      status: "pending",
      invitedAt: Date.now(),
    });
  }

  await ctx.db.patch(args.contactId, {
    contactUserId: matched._id,
    relationshipId,
    verified: status === "verified",
  });

  if (status === "pending") {
    await createNotification(ctx, {
      userId: matched._id,
      type: "contact",
      title: "New emergency contact request",
      body: `${args.contactName} wants to add you as an emergency contact.`,
      linkTo: "/contacts",
    });
  }

  return { registered: true, relationshipId, status };
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** (Re)invite a registered EAlert account for one of your contacts. */
export const inviteByContact = mutation({
  args: { contactId: v.id("emergencyContacts") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.userId !== userId) {
      throw new ConvexError("Contact not found.");
    }

    const result = await linkRegisteredContact(ctx, {
      userId,
      contactId: args.contactId,
      contactName: contact.name,
      phone: contact.phone,
      email: contact.email,
    });

    if (!result.registered) {
      throw new ConvexError("This contact is not currently registered with EAlert.");
    }
    if (result.status === "verified") {
      return { registered: true, verified: true, status: "verified" };
    }

    await logActivity(ctx, {
      userId,
      action: "contact_invite_sent",
      result: "success",
      metadata: JSON.stringify({ contactName: contact.name, relationshipId: result.relationshipId }),
    });
    return { registered: true, verified: false, status: result.status ?? "pending" };
  },
});

/** Accept or decline an incoming emergency-contact request. */
export const respondToInvite = mutation({
  args: { relationshipId: v.id("contactRelationships"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const rel = await ctx.db.get(args.relationshipId);
    if (!rel || rel.contactUserId !== userId) {
      throw new ConvexError("This request doesn't belong to you.");
    }
    if (rel.status !== "pending") {
      throw new ConvexError("This request was already answered.");
    }

    const now = Date.now();
    const accepted = args.accept;
    await ctx.db.patch(rel._id, {
      status: accepted ? "verified" : "declined",
      respondedAt: now,
    });

    const contact = await ctx.db.get(rel.emergencyContactId);
    if (contact) {
      await ctx.db.patch(contact._id, {
        verified: accepted ? true : false,
        contactUserId: rel.contactUserId,
      });
    }

    const myName = user.name ?? "A user";
    await createNotification(ctx, {
      userId: rel.userId,
      type: accepted ? "contact" : "system",
      title: accepted ? "Emergency contact request accepted" : "Emergency contact request declined",
      body: accepted
        ? `${myName} accepted your emergency contact request — they'll receive your alerts in the app.`
        : `${myName} declined your emergency contact request.`,
      linkTo: "/contacts",
    });

    await logActivity(ctx, {
      userId,
      action: accepted ? "contact_invite_accepted" : "contact_invite_declined",
      result: accepted ? "success" : "cancelled",
      metadata: JSON.stringify({ relationshipId: rel._id }),
    });

    return { accepted, verified: accepted };
  },
});

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** Pending requests where I'm the one being added. */
export const myIncomingInvites = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const rels = await ctx.db
      .query("contactRelationships")
      .withIndex("by_contactUserId", (q) => q.eq("contactUserId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const withInfo = await Promise.all(
      rels.map(async (rel) => {
        const requester = await ctx.db.get(rel.userId);
        const contact = await ctx.db.get(rel.emergencyContactId);
        return {
          relationshipId: rel._id,
          fromUserId: rel.userId,
          fromName: requester?.name ?? "An EAlert user",
          relationship: contact?.relationship ?? "Emergency contact",
          invitedAt: rel.invitedAt,
        };
      }),
    );
    return withInfo.sort((a, b) => b.invitedAt - a.invitedAt);
  },
});

/** True when `meId` is a verified emergency contact of `ownerId`. */
export async function isVerifiedContactOf(
  ctx: { db: QueryCtx["db"] },
  ownerId: Id<"users">,
  meId: Id<"users">,
): Promise<boolean> {
  const rel = await ctx.db
    .query("contactRelationships")
    .withIndex("by_pair", (q) => q.eq("userId", ownerId).eq("contactUserId", meId))
    .first();
  return rel?.status === "verified";
}
