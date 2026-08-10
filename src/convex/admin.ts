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
/* Role management                                                     */
/* ------------------------------------------------------------------ */

/**
 * Change another user's role. Admin-only, server-side authorization.
 *
 * Safeguards:
 *  - Only an existing admin may call this (requireAdmin).
 *  - An admin can never change their own role, so the console can't be
 *    locked out (or escalated) by accident.
 *  - The last remaining admin cannot be demoted, guaranteeing the
 *    deployment always keeps at least one administrator.
 *  - The role change is written to the activity log for audit.
 */
export const setUserRole = mutation({
  args: {
    id: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);

    if (args.id === userId) {
      throw new ConvexError("You can't change your own role.");
    }

    const target = await ctx.db.get(args.id);
    if (!target) throw new ConvexError("User not found.");
    if (target.isAnonymous) {
      throw new ConvexError("Guest accounts can't hold the admin role.");
    }

    const from = target.role ?? "user";
    const to = args.role;

    if (from === "admin" && to === "user") {
      const admins = (await ctx.db.query("users").collect()).filter(
        (u) => u.role === "admin",
      );
      if (admins.length <= 1) {
        throw new ConvexError(
          "You can't remove the last admin. Promote someone else first.",
        );
      }
    }

    await ctx.db.patch(args.id, { role: to });
    await logActivity(ctx, {
      userId,
      action: "role_changed",
      result: "success",
      metadata: JSON.stringify({
        targetUserId: args.id,
        from,
        to,
      }),
    });
    return true;
  },
});
