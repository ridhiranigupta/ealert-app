import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/session";
import { logActivity } from "./services/activity";

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const alerts = await ctx.db.query("alerts").collect();
    const now = Date.now();
    const dayStart = now - 24 * 60 * 60 * 1000;

    const activeUsers = users.filter(
      (u) => u.status !== "disabled" && !u.isAnonymous,
    ).length;
    const alertsToday = alerts.filter((a) => a._creationTime >= dayStart).length;
    const failed = alerts.filter((a) => a.status === "failed").length;

    return {
      totalUsers: users.filter((u) => !u.isAnonymous).length,
      activeUsers,
      disabledUsers: users.filter((u) => u.status === "disabled").length,
      totalAlerts: alerts.length,
      alertsToday,
      sentAlerts: alerts.filter((a) => a.status === "sent").length,
      deliveredAlerts: alerts.filter((a) => a.status === "delivered").length,
      cancelledAlerts: alerts.filter((a) => a.status === "cancelled").length,
      failedAlerts: failed,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Users (sanitized lists — no sensitive profile fields)               */
/* ------------------------------------------------------------------ */

export const listUsers = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const alerts = await ctx.db.query("alerts").collect();
    const countByUser = new Map<string, number>();
    for (const a of alerts) {
      countByUser.set(a.userId, (countByUser.get(a.userId) ?? 0) + 1);
    }

    const term = args.search?.trim().toLowerCase();
    const visible = users
      .filter((u) => !u.isAnonymous)
      .filter((u) => {
        if (!term) return true;
        return (
          (u.name ?? "").toLowerCase().includes(term) ||
          (u.email ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 200)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "Unnamed user",
        email: u.email ?? "",
        role: u.role ?? "user",
        status: u.status ?? "active",
        createdAt: u._creationTime,
        lastLoginAt: u.lastLoginAt ?? null,
        alertCount: countByUser.get(u._id) ?? 0,
      }));

    return visible;
  },
});

/** Full moderation view for a single user (admin only). */
export const getUserDetail = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.id);
    if (!user) throw new ConvexError("User not found.");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.id))
      .first();
    const contactCount = (
      await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", args.id))
        .collect()
    ).length;
    const alertCount = (
      await ctx.db
        .query("alerts")
        .withIndex("by_userId", (q) => q.eq("userId", args.id))
        .collect()
    ).length;

    return {
      user: {
        _id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        phone: user.phone ?? null,
        role: user.role ?? "user",
        status: user.status ?? "active",
        createdAt: user._creationTime,
        lastLoginAt: user.lastLoginAt ?? null,
        isAnonymous: user.isAnonymous ?? false,
      },
      profile: profile ?? null,
      contactCount,
      alertCount,
    };
  },
});

export const setUserStatus = mutation({
  args: { id: v.id("users"), status: v.union(v.literal("active"), v.literal("disabled")) },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const target = await ctx.db.get(args.id);
    if (!target) throw new ConvexError("User not found.");
    if (target._id === userId) {
      throw new ConvexError("You can't disable your own account here.");
    }

    await ctx.db.patch(args.id, { status: args.status });
    await logActivity(ctx, {
      userId,
      action: args.status === "disabled" ? "account_disabled" : "account_enabled",
      result: "success",
      metadata: JSON.stringify({ targetUserId: args.id }),
    });
    return true;
  },
});

/* ------------------------------------------------------------------ */
/* Alerts + activity                                                   */
/* ------------------------------------------------------------------ */

async function userNameMap(ctx: any, alerts: { userId: string }[]) {
  const ids = [...new Set(alerts.map((a) => a.userId))];
  const map = new Map<string, string>();
  for (const id of ids) {
    const u = await ctx.db.get(id);
    map.set(id, u?.name ?? "Unknown user");
  }
  return map;
}

export const listAlerts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const alerts = await ctx.db
      .query("alerts")
      .order("desc")
      .take(args.limit ?? 100);
    const names = await userNameMap(ctx, alerts);

    return alerts.map((a) => ({
      ...a,
      userName: names.get(a.userId) ?? "Unknown user",
    }));
  },
});

export const listActivity = query({
  args: {
    action: v.optional(v.string()),
    search: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const logs = await ctx.db
      .query("activityLogs")
      .order("desc")
      .take(300);

    const term = args.search?.trim().toLowerCase();
    const userIds = [...new Set(logs.map((l) => l.userId))];
    const names = new Map<string, string>();
    for (const id of userIds) {
      const u = await ctx.db.get(id);
      names.set(id, u?.name ?? "Unknown user");
    }

    return logs
      .filter((l) => {
        if (args.action && l.action !== args.action) return false;
        if (args.from && l.createdAt < args.from) return false;
        if (args.to && l.createdAt > args.to) return false;
        if (term) {
          const hay = `${names.get(l.userId) ?? ""} ${l.metadata ?? ""}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .slice(0, 200)
      .map((l) => ({
        ...l,
        userName: names.get(l.userId) ?? "Unknown user",
      }));
  },
});

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

/**
 * Idempotent bootstrap: promotes the very first registered user to admin
 * so the admin dashboard can be exercised. No-op once any admin exists.
 */
export const ensureFirstAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const anyAdmin = users.some((u) => u.role === "admin");
    if (anyAdmin) return false;

    const first = users
      .filter((u) => !u.isAnonymous)
      .sort((a, b) => a._creationTime - b._creationTime)[0];
    if (!first) return false;

    await ctx.db.patch(first._id, { role: "admin" });
    return true;
  },
});
