import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/session";
import { logActivity } from "./services/activity";

const MIN_TIMEOUT_MIN = 5;
const MAX_TIMEOUT_MIN = 240;

/**
 * Explicit, consent-based location sharing. A session only exists while the
 * user started it; it expires after `timeoutMinutes` unless updated. Browsers
 * cannot guarantee background tracking — sessions stop when the tab closes,
 * and the UI says so instead of promising background delivery.
 */
export const getActiveSession = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const session = await ctx.db
      .query("locationSessions")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .order("desc")
      .first();
    if (!session) return null;

    const expiresAt = session.lastUpdatedAt + session.timeoutMinutes * 60_000;
    const expired = Date.now() > expiresAt;
    return {
      ...session,
      expiresAt,
      expired,
      remainingMs: Math.max(0, expiresAt - Date.now()),
    };
  },
});

export const startSession = mutation({
  args: { timeoutMinutes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const timeoutMinutes = Math.min(
      MAX_TIMEOUT_MIN,
      Math.max(MIN_TIMEOUT_MIN, Math.round(args.timeoutMinutes ?? 30)),
    );

    // Close any existing active session so there is only one at a time.
    const existing = await ctx.db
      .query("locationSessions")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .collect();
    for (const s of existing) {
      await ctx.db.patch(s._id, { status: "stopped" });
    }

    const now = Date.now();
    const id = await ctx.db.insert("locationSessions", {
      userId,
      startedAt: now,
      lastUpdatedAt: now,
      timeoutMinutes,
      status: "active",
    });

    await logActivity(ctx, {
      userId,
      action: "location_started",
      result: "success",
      metadata: JSON.stringify({ sessionId: id, timeoutMinutes }),
    });
    return id;
  },
});

export const updateSession = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db
      .query("locationSessions")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .order("desc")
      .first();

    if (!session) {
      throw new ConvexError("No active location sharing session.");
    }

    const expiresAt = session.lastUpdatedAt + session.timeoutMinutes * 60_000;
    if (Date.now() > expiresAt) {
      await ctx.db.patch(session._id, { status: "expired" });
      throw new ConvexError("Location sharing session expired. Start a new session.");
    }

    const now = Date.now();
    await ctx.db.patch(session._id, { lastUpdatedAt: now });

    // Record the check-in.
    await ctx.db.insert("locations", {
      userId,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      source: "gps",
      label: `${args.lat.toFixed(5)}, ${args.lng.toFixed(5)}`,
      createdAt: now,
    });

    return { lastUpdatedAt: now, expiresAt: now + session.timeoutMinutes * 60_000 };
  },
});

export const stopSession = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db
      .query("locationSessions")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .order("desc")
      .first();
    if (!session) return false;

    await ctx.db.patch(session._id, { status: "stopped" });
    await logActivity(ctx, {
      userId,
      action: "location_stopped",
      result: "success",
      metadata: JSON.stringify({ sessionId: session._id }),
    });
    return true;
  },
});
