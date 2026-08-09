import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/session";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(60);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) =>
        q.eq("userId", user._id).eq("read", false),
      )
      .collect();
    return unread.length;
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const notification = await ctx.db.get(args.id);
    if (!notification || notification.userId !== userId) {
      throw new ConvexError("Notification not found.");
    }
    await ctx.db.patch(args.id, { read: true });
    return true;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) =>
        q.eq("userId", userId).eq("read", false),
      )
      .collect();
    for (const n of notifications) {
      await ctx.db.patch(n._id, { read: true });
    }
    return notifications.length;
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const n of notifications) {
      await ctx.db.delete(n._id);
    }
    return notifications.length;
  },
});
