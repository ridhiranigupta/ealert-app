import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/session";
import {
  estimateEtaMinutes,
  formatDistanceMeters,
  haversineMeters,
  ownerFirstName,
} from "./lib/emergencyLogic";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";
import { dispatchEmergencyPush } from "./services/push";

/**
 * Emergency Radius Broadcast — limited "Nearby Emergency" alerts.
 *
 * When an SOS is triggered with coordinates, EAlert users whose latest
 * known location (from `userLocations`, written only when they explicitly
 * share a location) falls inside the configured radius receive a LIMITED
 * alert. They can see the emergency location while the session is active
 * and can offer help, but they are NOT emergency contacts: no video, no
 * audio, no phone numbers, no owner controls.
 *
 * Privacy rules enforced here (and re-enforced in getSession/joinVideo):
 *   - helpers see the location ONLY while the session is open
 *   - helper rows never store the emergency's exact coordinates
 *   - responder coordinates are cleared when the session ends
 *   - verified contacts never also receive the limited broadcast
 */

/** Configurable radius — HELPER_RADIUS_KM (km), default 5 km, clamped 0.5–50. */
export function helperRadiusMeters(): number {
  const raw = Number(process.env.HELPER_RADIUS_KM);
  if (!Number.isFinite(raw) || raw <= 0) return 5_000;
  return Math.min(Math.max(raw, 0.5), 50) * 1000;
}

/** Locations older than this are not treated as "nearby" candidates. */
const HELPER_LOCATION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Only the nearest helpers are notified, to avoid broadcast storms. */
const MAX_HELPERS = 20;

export interface NearbyHelperCandidate {
  userId: Id<"users">;
  name?: string;
  distanceMeters: number;
}

/**
 * Find EAlert users within the radius. Excludes the SOS owner, users with
 * a disabled/suspended account, verified emergency contacts (they already
 * receive full access — never also the limited alert), and anyone already
 * notified for this alert (duplicate prevention).
 */
export async function findNearbyHelpers(
  ctx: { db: QueryCtx["db"] },
  args: {
    ownerId: Id<"users">;
    alertId: Id<"alerts">;
    lat: number;
    lng: number;
    radiusMeters: number;
    now?: number;
  },
): Promise<NearbyHelperCandidate[]> {
  const now = args.now ?? Date.now();

  // Verified contacts already receive FULL access — skip them.
  const verifiedRels = await ctx.db
    .query("contactRelationships")
    .withIndex("by_userId", (q) => q.eq("userId", args.ownerId))
    .filter((q) => q.eq(q.field("status"), "verified"))
    .collect();
  const verifiedIds = new Set(verifiedRels.map((r) => r.contactUserId));

  // Never notify the same user twice for the same alert.
  const existing = await ctx.db
    .query("emergencyHelpers")
    .withIndex("by_alertId", (q) => q.eq("alertId", args.alertId))
    .collect();
  const existingIds = new Set(existing.map((h) => h.userId));

  const spots = await ctx.db.query("userLocations").collect();
  const candidates: NearbyHelperCandidate[] = [];
  for (const spot of spots) {
    if (spot.userId === args.ownerId) continue;
    if (now - spot.updatedAt > HELPER_LOCATION_MAX_AGE_MS) continue; // stale fix
    if (verifiedIds.has(spot.userId)) continue;
    if (existingIds.has(spot.userId)) continue;
    const user = await ctx.db.get(spot.userId);
    if (!user) continue;
    if (user.status !== "active") continue; // suspended/disabled users excluded
    // Respect community assistance opt-out: users who explicitly disabled
    // community assistance are excluded from the nearby broadcast.
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", spot.userId))
      .first();
    if (profile && profile.communityAssistance === false) continue;
    const distance = haversineMeters(args.lat, args.lng, spot.lat, spot.lng);
    if (distance > args.radiusMeters) continue;
    candidates.push({
      userId: spot.userId,
      name: user.name,
      distanceMeters: Math.round(distance),
    });
  }

  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return candidates.slice(0, MAX_HELPERS);
}

/**
 * Record the broadcast: one row per helper + in-app notification + real
 * push to their registered devices. Returns how many helpers were notified.
 */
export async function notifyNearbyHelpers(
  ctx: MutationCtx,
  args: {
    sessionId: Id<"emergencySessions">;
    alertId: Id<"alerts">;
    ownerId: Id<"users">;
    ownerName?: string;
    helpers: NearbyHelperCandidate[];
    now?: number;
  },
): Promise<number> {
  const now = args.now ?? Date.now();
  const firstName = ownerFirstName(args.ownerName);

  const devices: { userId: string; platform: string; token: string }[] = [];
  for (const helper of args.helpers) {
    await ctx.db.insert("emergencyHelpers", {
      sessionId: args.sessionId,
      alertId: args.alertId,
      userId: helper.userId,
      ownerId: args.ownerId,
      ownerFirstName: firstName,
      distanceMeters: helper.distanceMeters,
      status: "notified",
      createdAt: now,
    });

    await createNotification(ctx, {
      userId: helper.userId,
      type: "emergency",
      title: "🚨 Someone near you needs help.",
      body: `${firstName} needs help nearby (~${formatDistanceMeters(helper.distanceMeters)} away). Tap to see the location and offer help.`,
      linkTo: `/emergency/${args.sessionId}`,
    });

    const userDevices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", helper.userId))
      .filter((q) => q.neq(q.field("revoked"), true))
      .collect();
    devices.push(
      ...userDevices.map((d) => ({
        userId: helper.userId as string,
        platform: d.platform,
        token: d.token,
      })),
    );
  }

  if (devices.length > 0) {
    const push = await dispatchEmergencyPush({
      devices,
      title: "🚨 Someone near you needs help.",
      body: `${firstName} needs help nearby. Tap to see the location and offer help.`,
      data: { type: "emergency", alertId: args.alertId, sessionId: args.sessionId },
    });
    // Revoke tokens the provider reports as gone.
    for (const r of push.results) {
      if (r.unregistered) {
        const dev = await ctx.db
          .query("devices")
          .withIndex("by_token", (q) => q.eq("token", r.device.token))
          .first();
        if (dev) await ctx.db.patch(dev._id, { revoked: true });
      }
    }
  }

  await logActivity(ctx, {
    userId: args.ownerId,
    action: "nearby_helpers_notified",
    result: "success",
    metadata: JSON.stringify({
      alertId: args.alertId,
      sessionId: args.sessionId,
      helpers: args.helpers.length,
    }),
  });
  return args.helpers.length;
}

/** The helper row authorizing `userId` for `sessionId`, if any. */
export async function findHelperRow(
  ctx: { db: QueryCtx["db"] },
  sessionId: Id<"emergencySessions">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("emergencyHelpers")
    .withIndex("by_sessionId_userId", (q) => q.eq("sessionId", sessionId).eq("userId", userId))
    .first();
}

/** Owner view: every helper notified about this session (+ live location). */
export async function listHelpersForOwner(
  ctx: { db: QueryCtx["db"] },
  sessionId: Id<"emergencySessions">,
) {
  const rows = await ctx.db
    .query("emergencyHelpers")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .collect();

  const out: {
    helperId: Id<"users">;
    name: string;
    distanceMeters: number;
    etaMinutes: number;
    status: string;
    respondedAt?: number;
    createdAt: number;
    shareLocation: boolean;
    location: { lat: number; lng: number; accuracy?: number; timestamp: number } | null;
  }[] = [];
  for (const row of rows) {
    const helperUser = await ctx.db.get(row.userId);
    out.push({
      helperId: row.userId,
      name: helperUser?.name ?? "A nearby helper",
      distanceMeters: row.distanceMeters,
      etaMinutes: estimateEtaMinutes(row.distanceMeters),
      status: row.status,
      respondedAt: row.respondedAt,
      createdAt: row.createdAt,
      shareLocation: Boolean(row.shareLocation),
      location:
        row.shareLocation &&
        row.responderLat != null &&
        row.responderLng != null
          ? {
              lat: row.responderLat,
              lng: row.responderLng,
              accuracy: row.responderAccuracy ?? undefined,
              timestamp: row.responderUpdatedAt ?? row.respondedAt ?? row.createdAt,
            }
          : null,
    });
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return out;
}

/**
 * Revoke helper location access when the emergency ends: clears responder
 * coordinates so no exact coordinates are retained for helpers.
 */
export async function revokeHelperAccess(
  ctx: MutationCtx,
  sessionId: Id<"emergencySessions">,
): Promise<void> {
  const rows = await ctx.db
    .query("emergencyHelpers")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .collect();
  for (const row of rows) {
    await ctx.db.patch(row._id, {
      shareLocation: false,
      responderLat: null,
      responderLng: null,
      responderAccuracy: null,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** Nearby emergencies where I'm a helper. Location only while active. */
export const myNearbyEmergencies = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const rows = await ctx.db
      .query("emergencyHelpers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);

    const result: {
      sessionId: Id<"emergencySessions">;
      alertId: Id<"alerts">;
      ownerFirstName: string;
      distanceMeters: number;
      emergencyType: string;
      status: "notified" | "responding";
      respondedAt?: number;
      createdAt: number;
      sessionStatus: string;
      isOpen: boolean;
      location: { lat: number; lng: number; accuracy?: number; timestamp: number } | null;
    }[] = [];
    for (const row of rows) {
      const session = await ctx.db.get(row.sessionId);
      if (!session) continue;
      const isOpen = session.status === "active" || session.status === "responding";
      const alert = await ctx.db.get(row.alertId);

      let location: (typeof result)[number]["location"] = null;
      if (isOpen) {
        const point = await ctx.db
          .query("emergencyLocations")
          .withIndex("by_sessionId_time", (q) => q.eq("sessionId", session._id))
          .filter((q) => q.eq(q.field("source"), "owner"))
          .order("desc")
          .take(1);
        if (point[0]) {
          location = {
            lat: point[0].lat,
            lng: point[0].lng,
            accuracy: point[0].accuracy,
            timestamp: point[0].timestamp,
          };
        }
      }

      result.push({
        sessionId: row.sessionId,
        alertId: row.alertId,
        ownerFirstName: row.ownerFirstName,
        distanceMeters: row.distanceMeters,
        emergencyType: alert?.type ?? "sos",
        status: row.status,
        respondedAt: row.respondedAt,
        createdAt: row.createdAt,
        sessionStatus: session.status,
        isOpen,
        location,
      });
    }
    return result;
  },
});

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Helper taps "I Can Help" — owner and verified contacts are notified. */
export const respondNearby = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const row = await findHelperRow(ctx, args.sessionId, userId);
    if (!row) {
      throw new ConvexError("You haven't been notified about this emergency.");
    }
    if (row.status === "responding") {
      return { alreadyResponding: true, sessionId: args.sessionId };
    }
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Emergency session not found.");
    if (session.status !== "active" && session.status !== "responding") {
      throw new ConvexError("This emergency has ended and can no longer accept help.");
    }

    const now = Date.now();
    const myName = user.name ?? "A nearby helper";
    await ctx.db.patch(row._id, { status: "responding", respondedAt: now });

    const distanceLabel = formatDistanceMeters(row.distanceMeters);
    await createNotification(ctx, {
      userId: row.ownerId,
      type: "emergency",
      title: "A nearby helper is responding",
      body: `${myName} is nearby (~${distanceLabel} away) and on their way to help.`,
      linkTo: `/emergency/${session._id}`,
    });

    // Verified contacts of the owner also learn a helper is responding.
    const recipients = await ctx.db
      .query("alertRecipients")
      .withIndex("by_alertId", (q) => q.eq("alertId", row.alertId))
      .filter((q) => q.neq(q.field("recipientUserId"), undefined))
      .collect();
    for (const r of recipients) {
      if (!r.recipientUserId) continue;
      await createNotification(ctx, {
        userId: r.recipientUserId,
        type: "emergency",
        title: "A nearby helper is responding",
        body: `${myName} is nearby (~${distanceLabel} away) and on their way to help ${row.ownerFirstName}.`,
        linkTo: `/emergency/${session._id}`,
      });
    }

    await logActivity(ctx, {
      userId,
      action: "nearby_helper_responding",
      result: "success",
      metadata: JSON.stringify({ sessionId: session._id, distanceMeters: row.distanceMeters }),
    });

    return {
      alreadyResponding: false,
      sessionId: args.sessionId,
      distanceMeters: row.distanceMeters,
    };
  },
});

/** Helper: stream their own live location while responding (explicit opt-in). */
export const shareHelperLocation = mutation({
  args: {
    sessionId: v.id("emergencySessions"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const row = await findHelperRow(ctx, args.sessionId, userId);
    if (!row || row.status !== "responding") {
      throw new ConvexError("You can only share your location while responding to this emergency.");
    }
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Emergency session not found.");
    if (session.status !== "active" && session.status !== "responding") {
      throw new ConvexError("This emergency has ended.");
    }

    const now = Date.now();
    await ctx.db.patch(row._id, {
      shareLocation: true,
      responderLat: args.lat,
      responderLng: args.lng,
      responderAccuracy: args.accuracy ?? null,
      responderUpdatedAt: now,
    });
    return { timestamp: now };
  },
});

/** Helper: stop sharing their live location. */
export const stopHelperLocation = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const row = await findHelperRow(ctx, args.sessionId, userId);
    if (!row) throw new ConvexError("Helper record not found.");
    await ctx.db.patch(row._id, { shareLocation: false });
    return true;
  },
});
