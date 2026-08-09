import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/session";

/** The signed-in user's own recent activity. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(40);
  },
});

/**
 * Client-triggered audit events (login, logout, registration, etc.)
 * Device metadata is captured client-side and passed in.
 */
export const logEvent = mutation({
  args: {
    action: v.string(),
    result: v.optional(v.union(v.literal("success"), v.literal("failed"), v.literal("cancelled"), v.literal("blocked"))),
    metadata: v.optional(v.string()),
    device: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    await ctx.db.insert("activityLogs", {
      userId,
      action: args.action.slice(0, 60),
      result: args.result ?? "success",
      metadata: args.metadata,
      device: args.device,
      createdAt: Date.now(),
    });
    return true;
  },
});
