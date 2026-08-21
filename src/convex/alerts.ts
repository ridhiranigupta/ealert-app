import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin, requireUser, requirePhoneVerified } from "./lib/session";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";
import {
  buildEmergencyMessages,
  computeAlertStatus,
  validateClientAlertId,
} from "./lib/alertLogic";
import { buildEmergencyPushPayload } from "./lib/emergencyLogic";
import { dispatchEmergencyAlert } from "./services/notify";
import type { RecipientOutcome } from "./services/notify";
import { dispatchEmergencyPush } from "./services/push";
import { createSessionForAlert } from "./emergencySessions";
import { findNearbyHelpers, helperRadiusMeters, notifyNearbyHelpers } from "./emergencyNearby";
import { upsertUserLocation } from "./locations";

/** Basic rate limit: at most one real alert per user per 10 seconds. */
const SOS_RATE_LIMIT_MS = 10_000;

function mapLink(lat: number, lng: number) {
  // Swap this for Google Maps / Mapbox deep links when keys are configured.
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Signed-in user's alert history, newest first, with recipients. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);

    const withRecipients = await Promise.all(
      alerts.map(async (alert) => {
        const recipients = await ctx.db
          .query("alertRecipients")
          .withIndex("by_alertId", (q) => q.eq("alertId", alert._id))
          .collect();
        return { ...alert, recipients };
      }),
    );
    return withRecipients;
  },
});

/** A single alert with recipients. Owner-only (admins may view any alert). */
export const getById = query({
  args: { id: v.id("alerts") },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const alert = await ctx.db.get(args.id);
    if (!alert) throw new ConvexError("Alert not found.");
    const isOwner = alert.userId === user._id;
    const isAdmin = user.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new ConvexError("You don't have access to this alert.");
    }

    const recipients = await ctx.db
      .query("alertRecipients")
      .withIndex("by_alertId", (q) => q.eq("alertId", alert._id))
      .collect();
    return { ...alert, recipients };
  },
});

export const recentCounts = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return {
      total: alerts.length,
      sent: alerts.filter((a) => a.status === "sent" || a.status === "sending").length,
      delivered: alerts.filter((a) => a.status === "delivered").length,
      partial: alerts.filter((a) => a.status === "partially_delivered").length,
      queued: alerts.filter((a) => a.status === "queued").length,
      cancelled: alerts.filter((a) => a.status === "cancelled").length,
      failed: alerts.filter((a) => a.status === "failed").length,
    };
  },
});

/**
 * Fire an SOS alert.
 *
 * Idempotency: the client generates a unique `clientAlertId` per SOS
 * action. If the same key is seen again (retry, double-click, page
 * refresh), the existing alert is returned instead of creating a
 * duplicate. Server-side rate limiting remains as a second guard.
 *
 * State machine: alert is created as `sending`, recipients as `queued`,
 * then the notify service dispatches each recipient and the alert status
 * is derived from the real outcomes (never upgraded to delivered without
 * provider confirmation).
 */
export const triggerSOS = mutation({
  args: {
    clientAlertId: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    locationLabel: v.optional(v.string()),
    note: v.optional(v.string()),
    allowHelperVideo: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePhoneVerified(ctx);

    // ── Idempotency: reuse an existing alert for the same client action ──
    const clientAlertId =
      args.clientAlertId && validateClientAlertId(args.clientAlertId)
        ? args.clientAlertId
        : undefined;
    if (clientAlertId) {
      const existing = await ctx.db
        .query("alerts")
        .withIndex("by_clientAlertId", (q) => q.eq("clientAlertId", clientAlertId))
        .first();
      if (existing) {
        return {
          alertId: existing._id,
          existing: true,
          recipientsCount: existing.recipientsCount,
          status: existing.status,
          channel: existing.channel ?? "none",
        };
      }
    }

    // ── Basic rate limiting — one alert per 10 seconds ──
    const latest = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (
      latest &&
      latest.status !== "cancelled" &&
      Date.now() - latest._creationTime < SOS_RATE_LIMIT_MS
    ) {
      throw new ConvexError(
        "Please wait a moment before sending another alert.",
      );
    }

    // ── Load only ACTIVE contacts, in priority order ──
    const contacts = (
      await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    )
      .filter((c) => c.active !== false)
      .sort((a, b) => a.priority - b.priority);

    const hasCoords = args.lat !== undefined && args.lng !== undefined;
    const label =
      args.locationLabel?.trim() ||
      (hasCoords ? `${args.lat!.toFixed(5)}, ${args.lng!.toFixed(5)}` : "Unknown location");
    const link = hasCoords ? mapLink(args.lat!, args.lng!) : undefined;

    const messages = buildEmergencyMessages({
      userName: user.name ?? "an EAlert user",
      locationLabel: label,
      mapLink: link,
      note: args.note?.trim()?.slice(0, 300),
    });

    const now = Date.now();
    const alertId = await ctx.db.insert("alerts", {
      userId,
      type: "sos",
      status: "sending",
      clientAlertId,
      message: messages.sms,
      triggeredAt: now,
      updatedAt: now,
      lat: hasCoords ? args.lat : undefined,
      lng: hasCoords ? args.lng : undefined,
      accuracy: args.accuracy,
      locationLabel: label,
      locationShared: hasCoords,
      recipientsCount: contacts.length,
      note: args.note?.trim()?.slice(0, 300) || undefined,
      channel: "none",
    });

    // ── One emergency session per SOS (app-to-app lifecycle) ──
    const sessionId = await createSessionForAlert(ctx, { userId, alertId, now, allowHelperVideo: args.allowHelperVideo });

    // ── Split recipients: verified EAlert contacts (push-first) vs legacy ──
    // Verified contacts never receive traditional SMS — they get an app push.
    const verifiedContacts = contacts.filter(
      (c) => c.contactUserId && c.verified === true,
    );
    const legacyContacts = contacts.filter(
      (c) => !(c.contactUserId && c.verified === true),
    );

    const legacyDispatch = legacyContacts.length > 0
      ? await dispatchEmergencyAlert(ctx, {
          userName: user.name ?? "an EAlert user",
          locationLabel: label,
          mapLink: link,
          note: args.note?.trim()?.slice(0, 300),
          timestamp: now,
          recipients: legacyContacts.map((c) => ({
            name: c.name,
            phone: c.phone,
            email: c.email,
            channels: c.channels as ("sms" | "email" | "push")[] | undefined,
          })),
        })
      : {
          channel: "none" as const,
          outcomes: [] as RecipientOutcome[],
          attempted: 0,
          queued: 0,
          sent: 0,
          delivered: 0,
          failed: 0,
        };

    // ── App-to-app push to verified contacts' registered devices ──
    const pushPayload = buildEmergencyPushPayload({
      userName: user.name ?? "an EAlert user",
      alertId: alertId as string,
      sessionId: sessionId as string,
    });

    const verifiedOutcomes = new Map<
      Id<"emergencyContacts">,
      { outcome: RecipientOutcome; pushStatus?: string; recipientUserId?: Id<"users"> }
    >();

    if (verifiedContacts.length > 0) {
      const deviceGroups: {
        contact: (typeof contacts)[number];
        devices: { userId: Id<"users">; token: string; platform: string }[];
      }[] = [];

      for (const c of verifiedContacts) {
        const devices = await ctx.db
          .query("devices")
          .withIndex("by_userId", (q) => q.eq("userId", c.contactUserId!))
          .filter((q) => q.neq(q.field("revoked"), true))
          .collect();
        deviceGroups.push({
          contact: c,
          devices: devices.map((d) => ({
            userId: c.contactUserId!,
            token: d.token,
            platform: d.platform,
          })),
        });
      }

      const allDevices = deviceGroups.flatMap((g) => g.devices);
      const pushResult = await dispatchEmergencyPush({
        devices: allDevices,
        title: pushPayload.notification.title,
        body: pushPayload.notification.body,
        data: pushPayload.data,
      });

      // Revoke tokens the provider reports as gone.
      for (const r of pushResult.results) {
        if (r.unregistered) {
          const dev = await ctx.db
            .query("devices")
            .withIndex("by_token", (q) => q.eq("token", r.device.token))
            .first();
          if (dev) await ctx.db.patch(dev._id, { revoked: true });
        }
      }

      for (const group of deviceGroups) {
        const groupTokens = new Set(group.devices.map((d) => d.token));
        const accepted = pushResult.results.some(
          (r) => groupTokens.has(r.device.token) && r.ok,
        );
        const errors = pushResult.results.filter(
          (r) => groupTokens.has(r.device.token) && !r.ok,
        );
        const noDevice = group.devices.length === 0;
        verifiedOutcomes.set(group.contact._id, {
          outcome: accepted
            ? { status: "sent", channel: "push", provider: pushResult.provider ?? "push" }
            : {
                status: "queued",
                channel: "push",
                error: noDevice
                  ? "no_device_registered"
                  : (errors[0]?.error ?? "provider_not_configured"),
              },
          pushStatus: accepted ? "sent" : "pending",
          recipientUserId: group.contact.contactUserId,
        });
      }
    }

    // ── One outcome row per contact, aligned with `contacts` ──
    const outcomes: RecipientOutcome[] = [];
    const pushStatuses: (string | undefined)[] = [];
    const recipientUserIds: (Id<"users"> | undefined)[] = [];
    let legacyIndex = 0;
    for (const c of contacts) {
      if (c.contactUserId && c.verified === true) {
        const o = verifiedOutcomes.get(c._id);
        outcomes.push(o?.outcome ?? { status: "queued" as const, channel: "push", error: "no_push_outcome" });
        pushStatuses.push(o?.pushStatus);
        recipientUserIds.push(o?.recipientUserId);
      } else {
        outcomes.push(
          legacyDispatch.outcomes[legacyIndex] ?? { status: "failed" as const, error: "no_outcome" },
        );
        pushStatuses.push(undefined);
        recipientUserIds.push(undefined);
        legacyIndex++;
      }
    }

    for (let i = 0; i < contacts.length; i++) {
      const outcome = outcomes[i];
      await ctx.db.insert("alertRecipients", {
        alertId,
        contactId: contacts[i]._id,
        contactName: contacts[i].name,
        phone: contacts[i].phone,
        email: contacts[i].email,
        status: outcome.status,
        channel: outcome.channel,
        provider: outcome.provider,
        providerMessageId: outcome.providerMessageId,
        error: outcome.error,
        attempts: 1,
        sentAt: now,
        deliveredAt: outcome.status === "delivered" ? now : undefined,
        lastAttemptAt: now,
        updatedAt: now,
        recipientUserId: recipientUserIds[i],
        pushStatus: pushStatuses[i] as "pending" | "sent" | "opened" | "active" | "delivered" | undefined,
        openedAt: undefined,
        respondedAt: undefined,
      });
    }

    if (hasCoords) {
      await ctx.db.insert("locations", {
        userId,
        lat: args.lat!,
        lng: args.lng!,
        accuracy: args.accuracy,
        source: "sos",
        label,
        createdAt: now,
      });
      // Keep the sender's latest known position fresh so they stay
      // discoverable as a nearby helper for other users' emergencies.
      await upsertUserLocation(ctx, {
        userId,
        lat: args.lat!,
        lng: args.lng!,
        accuracy: args.accuracy,
        updatedAt: now,
      });
    }

    // ── Nearby Emergency broadcast: LIMITED alert to EAlert users within
    //    the configured radius (default 5 km). They are not contacts:
    //    location-only access, no video, no phone numbers. ──
    let nearbyNotified = 0;
    if (hasCoords) {
      const helpers = await findNearbyHelpers(ctx, {
        ownerId: userId,
        alertId,
        lat: args.lat!,
        lng: args.lng!,
        radiusMeters: helperRadiusMeters(),
        now: Date.now(),
      });
      if (helpers.length > 0) {
        nearbyNotified = await notifyNearbyHelpers(ctx, {
          sessionId,
          alertId,
          ownerId: userId,
          ownerName: user.name,
          helpers,
        });
      }
    }

    // ── Derive the final alert status from real outcomes ──
    const finalStatus = computeAlertStatus(outcomes.map((o) => o.status));
    const failedOutcome = outcomes.find((o) => o.error);
    const pushSent = outcomes.filter((o) => o.channel === "push" && o.status === "sent").length;
    const failureReason =
      contacts.length === 0
        ? "no_emergency_contacts"
        : legacyDispatch.queued > 0 && legacyDispatch.sent === 0 && pushSent === 0
          ? "provider_not_configured"
          : failedOutcome?.error;

    const channel =
      pushSent > 0
        ? ("push" as const)
        : (legacyDispatch.channel as "sms" | "email" | "push" | "none" | "demo");

    await ctx.db.patch(alertId, {
      status: finalStatus,
      updatedAt: Date.now(),
      channel,
      failureReason,
      nearbyHelpersCount: nearbyNotified,
    });

    // ── Audit + in-app notification (honest wording) ──
    await logActivity(ctx, {
      userId,
      action: "sos_activated",
      result: finalStatus === "failed" ? "failed" : "success",
      metadata: JSON.stringify({
        alertId,
        sessionId,
        recipients: contacts.length,
        verified: verifiedContacts.length,
        channel,
        status: finalStatus,
        locationShared: hasCoords,
        nearbyHelpers: nearbyNotified,
      }),
    });

    const deliveredCount = legacyDispatch.sent + legacyDispatch.delivered + pushSent;
    const queuedCount = legacyDispatch.queued + outcomes.filter((o) => o.status === "queued").length;
    const title =
      contacts.length === 0
        ? "SOS alert recorded"
        : deliveredCount > 0
          ? `SOS alert sent to ${deliveredCount} contact${deliveredCount > 1 ? "s" : ""}`
          : queuedCount > 0
            ? "SOS alert recorded — delivery pending"
            : "SOS alert could not be delivered";
    const baseBody =
      contacts.length === 0
        ? "No active emergency contacts were notified. Add contacts so help can reach them."
        : deliveredCount > 0
          ? pushSent > 0
            ? `Alerted ${deliveredCount} of ${contacts.length} contacts (${pushSent} through the EAlert app).`
            : `Delivered to ${deliveredCount} of ${contacts.length} contacts.`
          : queuedCount > 0
            ? "Your alert is recorded. SMS/email delivery needs provider credentials, and app delivery needs verified contacts with push enabled."
            : "No contact could be reached. Check your contacts and try again.";
    const body =
      baseBody +
      (nearbyNotified > 0
        ? ` Also alerted ${nearbyNotified} nearby EAlert user${nearbyNotified === 1 ? "" : "s"} in your area.`
        : "");

    await createNotification(ctx, {
      userId,
      type: deliveredCount > 0 ? "delivery" : "sos",
      title,
      body,
      linkTo: `/emergency/${sessionId}`,
    });

    return {
      alertId,
      sessionId,
      existing: false,
      recipientsCount: contacts.length,
      status: finalStatus,
      channel,
      delivered: deliveredCount,
      queued: queuedCount,
      failed: legacyDispatch.failed + outcomes.filter((o) => o.status === "failed").length,
      nearbyNotified,
    };
  },
});

/** Retry a single failed/queued recipient of one of the user's own alerts. */
export const retryRecipient = mutation({
  args: { recipientId: v.id("alertRecipients") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) throw new ConvexError("Recipient not found.");
    const alert = await ctx.db.get(recipient.alertId);
    if (!alert || alert.userId !== userId) {
      throw new ConvexError("You don't have access to this alert.");
    }

    const now = Date.now();
    const attempts = (recipient.attempts ?? 1) + 1;
    const outcome = await dispatchEmergencyAlert(ctx, {
      userName: "a retried alert",
      locationLabel: alert.locationLabel ?? "Unknown location",
      mapLink: alert.lat !== undefined && alert.lng !== undefined ? mapLink(alert.lat, alert.lng) : undefined,
      timestamp: now,
      recipients: [
        {
          name: recipient.contactName,
          phone: recipient.phone,
          email: recipient.email,
        },
      ],
    });

    const o = outcome.outcomes[0];
    await ctx.db.patch(recipient._id, {
      status: o?.status ?? "failed",
      channel: o?.channel,
      provider: o?.provider,
      providerMessageId: o?.providerMessageId,
      error: o?.error,
      attempts,
      deliveredAt: o?.status === "delivered" ? now : recipient.deliveredAt,
      lastAttemptAt: now,
      updatedAt: now,
    });

    // Recompute alert status from all recipients.
    const all = await ctx.db
      .query("alertRecipients")
      .withIndex("by_alertId", (q) => q.eq("alertId", alert._id))
      .collect();
    const status = computeAlertStatus(all.map((r) => r.status));
    await ctx.db.patch(alert._id, { status, updatedAt: now });

    return { status, outcome: o };
  },
});

/**
 * Record a cancelled SOS (user aborted during the countdown).
 * Keeps history honest: an initiated-but-cancelled alert appears as
 * "cancelled" rather than vanishing.
 */
export const recordCancelledSOS = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const now = Date.now();

    const alertId = await ctx.db.insert("alerts", {
      userId,
      type: "sos",
      status: "cancelled",
      triggeredAt: now,
      updatedAt: now,
      cancelledAt: now,
      locationShared: false,
      recipientsCount: 0,
      note: "Alert cancelled by user during countdown.",
    });

    await logActivity(ctx, {
      userId,
      action: "sos_cancelled",
      result: "cancelled",
      metadata: JSON.stringify({ alertId }),
    });
    return alertId;
  },
});
