import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { cleanInput, getCurrentUserOrNull, requireUser } from "./lib/session";
import { canonicalPhone } from "./lib/alertLogic";
import { logActivity } from "./services/activity";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
};

/** True when the signed-in user holds the admin role. */
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    return user?.role === "admin";
  },
});

/** Update account-level fields (display name / phone). */
export const updateAccount = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const name = cleanInput(args.name, 80);
    const phone = cleanInput(args.phone, 30);

    // Store the canonical (digits-only) form so invite matching compares
    // like with like regardless of how each user typed their number.
    await ctx.db.patch(userId, {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone: canonicalPhone(phone) } : {}),
    });
    await logActivity(ctx, {
      userId,
      action: "profile_update",
      result: "success",
    });
    return true;
  },
});

/** Permanently delete the signed-in account and all related data. */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireUser(ctx);

    // Audit before deleting the user's own rows.
    await logActivity(ctx, {
      userId,
      action: "account_deleted",
      result: "success",
    });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (profile) await ctx.db.delete(profile._id);

    const contacts = await ctx.db
      .query("emergencyContacts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const c of contacts) await ctx.db.delete(c._id);

    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const a of alerts) {
      const recipients = await ctx.db
        .query("alertRecipients")
        .withIndex("by_alertId", (q) => q.eq("alertId", a._id))
        .collect();
      for (const r of recipients) await ctx.db.delete(r._id);
      await ctx.db.delete(a._id);
    }

    const locations = await ctx.db
      .query("locations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const l of locations) await ctx.db.delete(l._id);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const n of notifications) await ctx.db.delete(n._id);

    const logs = await ctx.db
      .query("activityLogs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const l of logs) await ctx.db.delete(l._id);

    // Finally, the account itself (auth tables cascade via auth internals).
    await ctx.db.delete(userId);
    return true;
  },
});

/** Record the moment a session was observed (login detection). */
export const touchLastLogin = mutation({
  args: { device: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    await ctx.db.patch(userId, { lastLoginAt: Date.now() });
    await logActivity(ctx, {
      userId,
      action: "login",
      result: "success",
      device: args.device,
    });
  },
});
