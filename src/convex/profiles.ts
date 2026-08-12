import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { cleanInput, requireUser } from "./lib/session";
import { canonicalPhone } from "./lib/alertLogic";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";

/**
 * Safety profile for the signed-in user.
 * Sensitive fields (address, family names, medical info) are only ever
 * returned to the owner — never in list queries or admin lists.
 */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    return { user, profile: profile ?? null };
  },
});

/** Whether the signed-in user has completed onboarding. */
export const isSetupComplete = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    return profile?.setupComplete ?? false;
  },
});

export const upsertProfile = mutation({
  args: {
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    workplace: v.optional(v.string()),
    fatherName: v.optional(v.string()),
    motherName: v.optional(v.string()),
    dob: v.optional(v.string()),
    gender: v.optional(v.string()),
    bloodGroup: v.optional(v.string()),
    medicalInfo: v.optional(v.string()),
    emergencyNote: v.optional(v.string()),
    photo: v.optional(v.string()),
    completeSetup: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);

    const fields = {
      fullName: cleanInput(args.fullName, 80),
      phone: cleanInput(args.phone, 30),
      email: cleanInput(args.email, 120),
      address: cleanInput(args.address, 200),
      city: cleanInput(args.city, 80),
      state: cleanInput(args.state, 80),
      country: cleanInput(args.country, 80),
      workplace: cleanInput(args.workplace, 120),
      fatherName: cleanInput(args.fatherName, 80),
      motherName: cleanInput(args.motherName, 80),
      dob: cleanInput(args.dob, 20),
      gender: cleanInput(args.gender, 30),
      bloodGroup: cleanInput(args.bloodGroup, 10),
      medicalInfo: cleanInput(args.medicalInfo, 500),
      emergencyNote: cleanInput(args.emergencyNote, 500),
      photo: cleanInput(args.photo, 500),
    };

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("profiles", { userId, ...fields });
    }

    // Keep the account-level phone in sync (canonical form). Onboarding
    // only writes the safety profile — without this, a user who never
    // visits Profile settings would be invisible to invite matching.
    if (fields.phone) {
      await ctx.db.patch(userId, { phone: canonicalPhone(fields.phone) });
    }

    if (args.completeSetup) {
      const current = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      if (current) {
        await ctx.db.patch(current._id, { setupComplete: true });
      }
      await logActivity(ctx, {
        userId,
        action: "profile_completed",
        result: "success",
      });
      await createNotification(ctx, {
        userId,
        type: "system",
        title: "Safety profile complete",
        body: "Your safety profile is ready. Add emergency contacts to prepare for any situation.",
        linkTo: "/contacts",
      });
    } else {
      await logActivity(ctx, {
        userId,
        action: "profile_update",
        result: "success",
      });
    }

    return true;
  },
});
