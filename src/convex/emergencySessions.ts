import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/session";
import {
  canAccessEmergencySession,
  canAccessEmergencyVideo,
  canTransitionSession,
  helperCanSeeLocation,
} from "./lib/emergencyLogic";
import { isVerifiedContactOf } from "./relationships";
import { findHelperRow, listHelpersForOwner, revokeHelperAccess } from "./emergencyNearby";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";
import { liveKitConfig, livekitToken, videoProviderStatus } from "./lib/videoProvider";

/** Safety net: sessions auto-expire after 4h even if never closed. */
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const LOCATION_MIN_INTERVAL_MS = 2_000;

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/** Create the emergency session for a fresh SOS alert. */
export async function createSessionForAlert(
  ctx: MutationCtx,
  args: { userId: Id<"users">; alertId: Id<"alerts">; now?: number; allowHelperVideo?: boolean },
): Promise<Id<"emergencySessions">> {
  const now = args.now ?? Date.now();
  const id = await ctx.db.insert("emergencySessions", {
    userId: args.userId,
    alertId: args.alertId,
    status: "active",
    startedAt: now,
    updatedAt: now,
    locationActive: false,
    videoActive: false,
    expiresAt: now + SESSION_MAX_AGE_MS,
    allowHelperVideo: args.allowHelperVideo,
  });
  await ctx.db.patch(args.alertId, { sessionId: id });
  return id;
}

/** Authorized: is `meId` a verified contact of `ownerId` AND a recipient of this alert? */
async function isVerifiedRecipientOf(
  ctx: { db: QueryCtx["db"] },
  ownerId: Id<"users">,
  meId: Id<"users">,
  alertId: Id<"alerts">,
): Promise<boolean> {
  if (!(await isVerifiedContactOf(ctx, ownerId, meId))) return false;
  const recipient = await ctx.db
    .query("alertRecipients")
    .withIndex("by_alertId", (q) => q.eq("alertId", alertId))
    .filter((q) => q.eq(q.field("recipientUserId"), meId))
    .first();
  return recipient !== null;
}

async function latestLocation(
  ctx: { db: QueryCtx["db"] },
  sessionId: Id<"emergencySessions">,
  source: string,
) {
  const points = await ctx.db
    .query("emergencyLocations")
    .withIndex("by_sessionId_time", (q) => q.eq("sessionId", sessionId))
    .filter((q) => q.eq(q.field("source"), source))
    .order("desc")
    .take(1);
  return points[0] ?? null;
}

async function assertSessionOpen(session: { status: string }, verb: string) {
  if (session.status !== "active" && session.status !== "responding") {
    throw new ConvexError(
      `This emergency session is ${session.status} — it can no longer ${verb}.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/**
 * Read an emergency session. Server-side authorization only:
 *   owner → full view
 *   verified contact (of the owner AND recipient of the alert) → full view
 *   admin → limited view (never precise live location by default)
 *   anyone else → denied
 */
export const getSession = query({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Emergency session not found.");

    const isOwner = session.userId === userId;
    const isVerifiedRecipient = await isVerifiedRecipientOf(
      ctx,
      session.userId,
      userId,
      session.alertId,
    );
    const helperRow = await findHelperRow(ctx, session._id, userId);
    const access = canAccessEmergencySession({
      isOwner,
      isVerifiedContact: isVerifiedRecipient,
      isHelperNearby: helperRow !== null,
      role: user.role,
    });
    if (!access) {
      throw new ConvexError("You don't have access to this emergency session.");
    }

    const alert = await ctx.db.get(session.alertId);
    const owner = await ctx.db.get(session.userId);
    const video = await ctx.db
      .query("videoSessions")
      .withIndex("by_emergencySessionId", (q) => q.eq("emergencySessionId", session._id))
      .order("desc")
      .first();

    const recipients = alert
      ? await ctx.db
          .query("alertRecipients")
          .withIndex("by_alertId", (q) => q.eq("alertId", alert._id))
          .collect()
      : [];

    // When the owner has opted to allow nearby helpers to see video,
    // helpers also gain video access (role upgrade for this session).
    const allowHelperVideo = session.allowHelperVideo === true;
    const helperHasVideo = access === "helper_nearby" && allowHelperVideo;
    const effectiveVideoAccess =
      canAccessEmergencyVideo(access) || helperHasVideo;

    const myRecipient =
      access !== "owner"
        ? recipients.find((r) => r.recipientUserId === userId) ?? null
        : null;

    // Precise live location for the owner and verified contacts, and for
    // nearby helpers ONLY while the emergency is still active.
    const showLocation =
      access === "owner" ||
      access === "verified_contact" ||
      (access === "helper_nearby" && helperCanSeeLocation(session.status));
    const ownerLocation = showLocation
      ? await latestLocation(ctx, session._id, "owner")
      : null;
    const responderLocation =
      showLocation && session.responderLocationShared && session.responderId
        ? await latestLocation(ctx, session._id, "responder")
        : null;

    const videoConfig = videoProviderStatus();

    return {
      session: {
        _id: session._id,
        status: session.status,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        endedAt: session.endedAt,
        endedBy: session.endedBy,
        locationActive: session.locationActive,
        videoActive: session.videoActive,
        responderId: session.responderId,
        responderName: session.responderName,
        responderLocationShared: session.responderLocationShared ?? false,
        expiresAt: session.expiresAt,
      },
      myRole: access,
      owner:
        access === "helper_nearby" && helperRow
          ? { name: helperRow.ownerFirstName } // first name only — never full identity
          : access === "owner" || access === "verified_contact"
            ? {
                name: owner?.name ?? "An EAlert user",
                phone: access === "verified_contact" ? owner?.phone : undefined,
              }
            : { name: owner?.name ?? "An EAlert user" },
      alertId: session.alertId,
      alertType: alert?.type ?? "sos",
      myRecipient:
        myRecipient &&
        ({
          contactName: myRecipient.contactName,
          status: myRecipient.status,
          pushStatus: myRecipient.pushStatus,
          openedAt: myRecipient.openedAt,
          respondedAt: myRecipient.respondedAt,
        } as const),
      recipients:
        access === "owner"
          ? recipients.map(
              (r) =>
                ({
                  contactName: r.contactName,
                  deliveryStatus: r.status,
                  pushStatus: r.pushStatus,
                  channel: r.channel,
                  openedAt: r.openedAt,
                  respondedAt: r.respondedAt,
                  appRecipient: Boolean(r.recipientUserId),
                }) as const,
            )
          : undefined,
      latestLocation: ownerLocation
        ? {
            lat: ownerLocation.lat,
            lng: ownerLocation.lng,
            accuracy: ownerLocation.accuracy,
            timestamp: ownerLocation.timestamp,
          }
        : null,
      locationUpdatedAt: ownerLocation?.timestamp ?? null,
      responderLocation: responderLocation
        ? {
            lat: responderLocation.lat,
            lng: responderLocation.lng,
            accuracy: responderLocation.accuracy,
            timestamp: responderLocation.timestamp,
          }
        : null,
      video: video && effectiveVideoAccess
        ? {
            provider: video.provider,
            roomId: video.roomId,
            status: video.status,
            startedAt: video.startedAt,
          }
        : null,
      videoConfig: effectiveVideoAccess
        ? {
            configured: videoConfig.configured,
            provider: videoConfig.provider,
            url: videoConfig.url,
          }
        : { configured: false },
      allowHelperVideo,
      // Nearby helpers notified about this session (owner view only).
      helpers: access === "owner" ? await listHelpersForOwner(ctx, session._id) : undefined,
      // The helper's own record — lets them see distance / respond state.
      helper:
        access === "helper_nearby" && helperRow
          ? {
              distanceMeters: helperRow.distanceMeters,
              status: helperRow.status,
              respondedAt: helperRow.respondedAt,
              shareLocation: Boolean(helperRow.shareLocation),
              myLocation:
                helperRow.shareLocation &&
                helperRow.responderLat != null &&
                helperRow.responderLng != null
                  ? {
                      lat: helperRow.responderLat,
                      lng: helperRow.responderLng,
                      accuracy: helperRow.responderAccuracy ?? undefined,
                      timestamp: helperRow.responderUpdatedAt ?? undefined,
                    }
                  : null,
            }
          : undefined,
    };
  },
});

/** The owner's active emergency session (for the dashboard card). */
export const myActiveSession = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db
      .query("emergencySessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "active"), q.eq(q.field("status"), "responding")),
      )
      .order("desc")
      .first();
    if (!session) return null;
    return { _id: session._id, status: session.status, startedAt: session.startedAt };
  },
});

/** Emergency sessions where I'm a verified contact (recipient entry points). */
export const listSessionsForContact = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const rels = await ctx.db
      .query("contactRelationships")
      .withIndex("by_contactUserId", (q) => q.eq("contactUserId", userId))
      .filter((q) => q.eq(q.field("status"), "verified"))
      .collect();

    const sessions: {
      _id: Id<"emergencySessions">;
      status: string;
      startedAt: number;
      ownerName?: string;
    }[] = [];
    for (const rel of rels) {
      const active = await ctx.db
        .query("emergencySessions")
        .withIndex("by_userId", (q) => q.eq("userId", rel.userId))
        .filter((q) =>
          q.or(q.eq(q.field("status"), "active"), q.eq(q.field("status"), "responding")),
        )
        .order("desc")
        .take(5);
      const owner = await ctx.db.get(rel.userId);
      for (const s of active) {
        sessions.push({
          _id: s._id,
          status: s.status,
          startedAt: s.startedAt,
          ownerName: owner?.name ?? "An EAlert user",
        });
      }
    }
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  },
});

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/** Owner: push a live location point into the active session. */
export const updateEmergencyLocation = mutation({
  args: {
    sessionId: v.id("emergencySessions"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new ConvexError("Session not found.");
    }
    await assertSessionOpen(session, "update location");

    const last = await latestLocation(ctx, session._id, "owner");
    if (
      last &&
      args.sessionId &&
      Date.now() - last.timestamp < LOCATION_MIN_INTERVAL_MS
    ) {
      return { throttled: true, timestamp: last.timestamp };
    }

    const now = Date.now();
    await ctx.db.insert("emergencyLocations", {
      sessionId: args.sessionId,
      userId,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      timestamp: now,
      source: "owner",
    });
    await ctx.db.patch(session._id, {
      locationActive: true,
      updatedAt: now,
    });
    return { throttled: false, timestamp: now };
  },
});

/** Owner: start live emergency video (server-side token, honest config). */
export const startVideo = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new ConvexError("Session not found.");
    }
    await assertSessionOpen(session, "start video");

    const config = videoProviderStatus();
    if (!config.configured) {
      return {
        configured: false,
        error: "Live video requires a provider. Configure LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.",
      };
    }
    const lk = liveKitConfig()!;

    const now = Date.now();
    const roomId = `emergency-${session._id}`;
    let video = await ctx.db
      .query("videoSessions")
      .withIndex("by_emergencySessionId", (q) => q.eq("emergencySessionId", session._id))
      .first();

    if (!video || video.status === "ended") {
      const videoId = await ctx.db.insert("videoSessions", {
        emergencySessionId: session._id,
        provider: config.provider ?? "livekit",
        roomId,
        status: "active",
        createdBy: userId,
        startedAt: now,
        expiresAt: now + 6 * 60 * 60 * 1000,
      });
      video = await ctx.db.get(videoId);
    } else {
      await ctx.db.patch(video._id, { status: "active", startedAt: now });
    }

    await ctx.db.patch(session._id, { videoActive: true, updatedAt: now });

    // Tell verified app recipients that live video is now available so they
    // can join while the emergency is still active.
    const appRecipients = await ctx.db
      .query("alertRecipients")
      .withIndex("by_alertId", (q) => q.eq("alertId", session.alertId))
      .filter((q) => q.neq(q.field("recipientUserId"), undefined))
      .collect();
    for (const r of appRecipients) {
      if (!r.recipientUserId) continue;
      await createNotification(ctx, {
        userId: r.recipientUserId,
        type: "emergency",
        title: "Live video is available",
        body: `${user.name ?? "They"} started live video. Join to see what's happening.`,
        linkTo: `/emergency/${session._id}`,
      });
    }

    const token = await livekitToken({
      apiKey: lk.apiKey,
      apiSecret: lk.apiSecret,
      room: roomId,
      identity: userId,
      name: user.name,
      canPublish: true,
      ttlSeconds: 6 * 3600,
    });

    await logActivity(ctx, {
      userId,
      action: "video_started",
      result: "success",
      metadata: JSON.stringify({ sessionId: session._id, provider: config.provider }),
    });

    return {
      configured: true,
      provider: config.provider,
      url: config.url,
      roomId,
      token,
      expiresAt: now + 6 * 60 * 60 * 1000,
    };
  },
});

/**
 * Verified contact: obtain a subscribe-only join token for the live
 * emergency video. Authorization is re-checked server-side on every call;
 * tokens are short-lived and never persisted.
 */
export const joinVideo = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    const isVerified = await isVerifiedRecipientOf(ctx, session.userId, userId, session.alertId);
    const helperRow = await findHelperRow(ctx, session._id, userId);
    // Verified contacts always have video access; nearby helpers only when
    // the owner has opted in with allowHelperVideo.
    if (!isVerified && !(helperRow && session.allowHelperVideo)) {
      throw new ConvexError("You don't have access to the live video for this emergency.");
    }
    if (!session.videoActive) {
      return { configured: false, active: false, error: "No live video is active for this emergency." };
    }
    const config = videoProviderStatus();
    if (!config.configured) {
      return { configured: false, active: false, error: "Live video requires a provider. Configure LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET." };
    }
    const lk = liveKitConfig()!;
    const video = await ctx.db
      .query("videoSessions")
      .withIndex("by_emergencySessionId", (q) => q.eq("emergencySessionId", session._id))
      .order("desc")
      .first();
    if (!video || video.status !== "active") {
      return { configured: true, active: false, error: "The live video session has ended." };
    }
    // One-way broadcast: the victim is the ONLY publisher.
    // Verified contacts and nearby helpers receive subscribe-only tokens —
    // they can see the victim's live stream but can never publish their own
    // camera, microphone, or screen share.
    const token = await livekitToken({
      apiKey: lk.apiKey,
      apiSecret: lk.apiSecret,
      room: video.roomId,
      identity: userId,
      name: user.name,
      canPublish: false,
      ttlSeconds: 2 * 3600,
    });
    return {
      configured: true,
      active: true,
      provider: config.provider,
      url: config.url,
      roomId: video.roomId,
      token,
      expiresAt: Date.now() + 2 * 3600 * 1000,
    };
  },
});

/** Owner: stop live video. */
export const stopVideo = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new ConvexError("Session not found.");
    }
    const videos = await ctx.db
      .query("videoSessions")
      .withIndex("by_emergencySessionId", (q) => q.eq("emergencySessionId", session._id))
      .collect();
    for (const video of videos) {
      if (video.status === "active") {
        await ctx.db.patch(video._id, { status: "ended", endedAt: Date.now() });
      }
    }
    await ctx.db.patch(session._id, { videoActive: false, updatedAt: Date.now() });
    await logActivity(ctx, { userId, action: "video_ended", result: "success", metadata: JSON.stringify({ sessionId: session._id }) });
    return true;
  },
});

/** Verified contact: acknowledge they opened the session. */
export const markSessionOpened = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    if (!(await isVerifiedRecipientOf(ctx, session.userId, userId, session.alertId))) {
      throw new ConvexError("You don't have access to this emergency session.");
    }

    const now = Date.now();
    const recipient = await ctx.db
      .query("alertRecipients")
      .withIndex("by_alertId", (q) => q.eq("alertId", session.alertId))
      .filter((q) => q.eq(q.field("recipientUserId"), userId))
      .first();
    if (recipient && !recipient.openedAt) {
      await ctx.db.patch(recipient._id, {
        openedAt: now,
        pushStatus: recipient.pushStatus === "active" ? "active" : "opened",
        updatedAt: now,
      });
      await logActivity(ctx, {
        userId,
        action: "emergency_opened",
        result: "success",
        metadata: JSON.stringify({ sessionId: session._id, alertId: session.alertId }),
      });
    }
    return true;
  },
});

/** Verified contact: mark "I'm responding" (+ optional responder location). */
export const markResponding = mutation({
  args: { sessionId: v.id("emergencySessions"), shareLocation: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    if (!(await isVerifiedRecipientOf(ctx, session.userId, userId, session.alertId))) {
      throw new ConvexError("You don't have access to this emergency session.");
    }
    await assertSessionOpen(session, "respond");

    const now = Date.now();
    const name = user.name ?? "A contact";
    const patch: Record<string, unknown> = {
      status: "responding",
      responderId: userId,
      responderName: name,
      updatedAt: now,
    };
    if (args.shareLocation) patch.responderLocationShared = true;
    await ctx.db.patch(session._id, patch);

    const recipient = await ctx.db
      .query("alertRecipients")
      .withIndex("by_alertId", (q) => q.eq("alertId", session.alertId))
      .filter((q) => q.eq(q.field("recipientUserId"), userId))
      .first();
    if (recipient) {
      await ctx.db.patch(recipient._id, {
        respondedAt: now,
        pushStatus: "active",
        updatedAt: now,
      });
    }

    // Tell the owner someone is on their way.
    await createNotification(ctx, {
      userId: session.userId,
      type: "emergency",
      title: "Someone is responding",
      body: `${name} is responding to your emergency.`,
      linkTo: `/emergency/${session._id}`,
    });
    await logActivity(ctx, {
      userId,
      action: "emergency_responding",
      result: "success",
      metadata: JSON.stringify({ sessionId: session._id, shareLocation: Boolean(args.shareLocation) }),
    });

    return { responderName: name };
  },
});

/** Verified contact: stream their own location while responding (explicit opt-in). */
export const updateResponderLocation = mutation({
  args: {
    sessionId: v.id("emergencySessions"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session not found.");
    if (session.responderId !== userId || session.responderLocationShared !== true) {
      throw new ConvexError("You haven't opted in to sharing your location.");
    }
    await assertSessionOpen(session, "share location");

    const now = Date.now();
    await ctx.db.insert("emergencyLocations", {
      sessionId: args.sessionId,
      userId,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      timestamp: now,
      source: "responder",
    });
    await ctx.db.patch(session._id, { updatedAt: now });
    return { timestamp: now };
  },
});

/** Owner: end the emergency session (confirm on client, enforce here). */
export const endSession = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new ConvexError("Session not found.");
    }
    if (session.status === "resolved" || session.status === "cancelled") {
      return { alreadyEnded: true };
    }

    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "resolved",
      endedAt: now,
      endedBy: userId,
      locationActive: false,
      videoActive: false,
      responderLocationShared: false,
      updatedAt: now,
    });

    const videos = await ctx.db
      .query("videoSessions")
      .withIndex("by_emergencySessionId", (q) => q.eq("emergencySessionId", session._id))
      .collect();
    for (const video of videos) {
      if (video.status === "active") {
        await ctx.db.patch(video._id, { status: "ended", endedAt: now });
      }
    }

    // Nearby helpers lose location access the moment the session ends.
    await revokeHelperAccess(ctx, session._id);

    // Notify verified contacts that the emergency is over.
    const recipients = await ctx.db
      .query("alertRecipients")
      .withIndex("by_alertId", (q) => q.eq("alertId", session.alertId))
      .filter((q) => q.neq(q.field("recipientUserId"), undefined))
      .collect();
    const ownerName = user.name ?? "The person";
    for (const r of recipients) {
      if (!r.recipientUserId) continue;
      await createNotification(ctx, {
        userId: r.recipientUserId,
        type: "emergency",
        title: "Emergency session ended",
        body: `Emergency session ended by ${ownerName}.`,
        linkTo: `/emergency/${session._id}`,
      });
    }

    await logActivity(ctx, {
      userId,
      action: "emergency_session_ended",
      result: "success",
      metadata: JSON.stringify({ sessionId: session._id }),
    });

    return { alreadyEnded: false, status: "resolved" as const };
  },
});

/** Owner: cancel before/without resolution (no recipients were notified app-side). */
export const cancelSession = mutation({
  args: { sessionId: v.id("emergencySessions") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new ConvexError("Session not found.");
    }
    if (!canTransitionSession(session.status, "cancelled")) {
      throw new ConvexError("This session can no longer be cancelled.");
    }
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "cancelled",
      endedAt: now,
      endedBy: userId,
      locationActive: false,
      videoActive: false,
      updatedAt: now,
    });
    await revokeHelperAccess(ctx, session._id);
    return { status: "cancelled" as const };
  },
});

/* ------------------------------------------------------------------ */
/* Cron: expire stale sessions                                         */
/* ------------------------------------------------------------------ */

/**
 * Owner: toggle whether nearby helpers can see live video for this session.
 *
 * When disabling (allow=false):
 *   1. Revoke helper location + session access.
 *   2. End the active video session so disconnected helpers cannot reconnect.
 *      The owner can restart the video at any time.
 *   3. The session stays open — location sharing and SOS notifications
 *      continue unaffected.
 */
export const setAllowHelperVideo = mutation({
  args: {
    sessionId: v.id("emergencySessions"),
    allow: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new ConvexError("Session not found.");
    }
    await assertSessionOpen(session, "update video settings");
    const now = Date.now();
    await ctx.db.patch(args.sessionId, { allowHelperVideo: args.allow, updatedAt: now });

    if (!args.allow) {
      // Immediately disconnect all nearby helpers from the video room
      // by ending the video session. Verified contacts keep their
      // existing subscribe-only access and can re-join if the owner
      // restarts video later.
      await revokeHelperAccess(ctx, session._id);
      const videos = await ctx.db
        .query("videoSessions")
        .withIndex("by_emergencySessionId", (q) => q.eq("emergencySessionId", session._id))
        .collect();
      for (const video of videos) {
        if (video.status === "active") {
          await ctx.db.patch(video._id, { status: "ended", endedAt: now });
        }
      }
      await ctx.db.patch(session._id, { videoActive: false, updatedAt: now });

      // Notify helpers that video access has been revoked.
      const helpers = await ctx.db
        .query("emergencyHelpers")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const h of helpers) {
        await createNotification(ctx, {
          userId: h.userId,
          type: "emergency",
          title: "Video access revoked",
          body: "The emergency sender has disabled nearby helper video access.",
          linkTo: `/emergency/${session._id}`,
        });
      }
    }

    return { allowHelperVideo: args.allow };
  },
});

export const expireStaleSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [activeRows, respondingRows] = await Promise.all([
      ctx.db
        .query("emergencySessions")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
      ctx.db
        .query("emergencySessions")
        .withIndex("by_status", (q) => q.eq("status", "responding"))
        .collect(),
    ]);
    const stale = [...activeRows, ...respondingRows];

    const now = Date.now();
    let expired = 0;
    for (const session of stale) {
      const expiresAt = session.expiresAt ?? session.startedAt + SESSION_MAX_AGE_MS;
      if (now <= expiresAt) continue;
      await ctx.db.patch(session._id, {
        status: "expired",
        endedAt: now,
        locationActive: false,
        videoActive: false,
        responderLocationShared: false,
        updatedAt: now,
      });
      const videos = await ctx.db
        .query("videoSessions")
        .withIndex("by_emergencySessionId", (q) => q.eq("emergencySessionId", session._id))
        .collect();
      for (const video of videos) {
        if (video.status === "active") {
          await ctx.db.patch(video._id, { status: "ended", endedAt: now });
        }
      }
      await revokeHelperAccess(ctx, session._id);
      expired++;
    }
    return { expired };
  },
});
