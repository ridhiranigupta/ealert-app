import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/session";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";
import {
  buildEmergencyMessages,
  computeAlertStatus,
  validateClientAlertId,
} from "./lib/alertLogic";
import { dispatchEmergencyAlert } from "./services/notify";

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
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);

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

    // ── Dispatch each recipient and record real outcomes ──
    const dispatch = await dispatchEmergencyAlert(ctx, {
      userName: user.name ?? "an EAlert user",
      locationLabel: label,
      mapLink: link,
      note: args.note?.trim()?.slice(0, 300),
      timestamp: now,
      recipients: contacts.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        channels: c.channels as ("sms" | "email" | "push")[] | undefined,
      })),
    });

    for (let i = 0; i < contacts.length; i++) {
      const outcome = dispatch.outcomes[i] ?? { status: "failed" as const, error: "no_outcome" };
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
    }

    // ── Derive the final alert status from real outcomes ──
    const finalStatus = computeAlertStatus(dispatch.outcomes.map((o) => o.status));
    const failedOutcome = dispatch.outcomes.find((o) => o.error);
    const failureReason =
      contacts.length === 0
        ? "no_emergency_contacts"
        : dispatch.queued > 0 && dispatch.sent === 0
          ? "provider_not_configured"
          : failedOutcome?.error;

    await ctx.db.patch(alertId, {
      status: finalStatus,
      updatedAt: Date.now(),
      channel: dispatch.channel,
      failureReason,
    });

    // ── Audit + in-app notification (honest wording) ──
    await logActivity(ctx, {
      userId,
      action: "sos_activated",
      result: finalStatus === "failed" ? "failed" : "success",
      metadata: JSON.stringify({
        alertId,
        recipients: contacts.length,
        channel: dispatch.channel,
        status: finalStatus,
        locationShared: hasCoords,
      }),
    });

    const deliveredCount = dispatch.sent + dispatch.delivered;
    const title =
      contacts.length === 0
        ? "SOS alert recorded"
        : deliveredCount > 0
          ? `SOS alert sent to ${deliveredCount} contact${deliveredCount > 1 ? "s" : ""}`
          : dispatch.queued > 0
            ? "SOS alert recorded — provider not configured"
            : "SOS alert could not be delivered";
    const body =
      contacts.length === 0
        ? "No active emergency contacts were notified. Add contacts so help can reach them."
        : deliveredCount > 0
          ? `Delivered to ${deliveredCount} of ${contacts.length} contacts.`
          : dispatch.queued > 0
            ? "Your alert is recorded, but no SMS/email provider is configured, so nothing was sent externally. Add provider credentials to enable real delivery."
            : "No contact could be reached. Check your contacts and try again.";

    await createNotification(ctx, {
      userId,
      type: deliveredCount > 0 ? "delivery" : "sos",
      title,
      body,
      linkTo: `/alerts/${alertId}`,
    });

    return {
      alertId,
      existing: false,
      recipientsCount: contacts.length,
      status: finalStatus,
      channel: dispatch.channel,
      delivered: deliveredCount,
      queued: dispatch.queued,
      failed: dispatch.failed,
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
