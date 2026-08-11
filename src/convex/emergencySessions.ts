import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/session";
import { canAccessEmergencySession, canTransitionSession } from "./lib/emergencyLogic";
import { isVerifiedContactOf } from "./relationships";
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
  args: { userId: Id<"users">; alertId: Id<"alerts">; now?: number },
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
    const access = canAccessEmergencySession({
      isOwner,
      isVerifiedContact: isVerifiedRecipient,
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

    const myRecipient =
      access !== "owner"
        ? recipients.find((r) => r.recipientUserId === userId) ?? null
        : null;

    // Precise live location only for the owner and verified contacts.
    const showLocation = access === "owner" || access === "verified_contact";
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
        access === "owner" || access === "verified_contact"
          ? {
              name: owner?.name ?? "An EAlert user",
              phone: access === "verified_contact" ? owner?.phone : undefined,
            }
          : { name: owner?.name ?? "An EAlert user" },
      alertId: session.alertId,
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
      video: video
        ? {
            provider: video.provider,
            roomId: video.roomId,
            status: video.status,
            startedAt: video.startedAt,
          }
        : null,
      videoConfig: {
        configured: videoConfig.configured,
        provider: videoConfig.provider,
        url: videoConfig.url,
      },
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
    if (!(await isVerifiedRecipientOf(ctx, session.userId, userId, session.alertId))) {
      throw new ConvexError("You don't have access to this emergency session.");
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
    const token = await livekitToken({
      apiKey: lk.apiKey,
      apiSecret: lk.apiSecret,
      room: video.roomId,
      identity: userId,
      name: user.name,
      canPublish: true,
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
    return { status: "cancelled" as const };
  },
});

/* ------------------------------------------------------------------ */
/* Cron: expire stale sessions                                         */
/* ------------------------------------------------------------------ */

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
      expired++;
    }
    return { expired };
  },
});
