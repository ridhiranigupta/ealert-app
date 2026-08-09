import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/session";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";
import {
  buildEmergencyMessage,
  dispatchEmergencyAlert,
} from "./services/notify";

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
      sent: alerts.filter((a) => a.status === "sent").length,
      delivered: alerts.filter((a) => a.status === "delivered").length,
      cancelled: alerts.filter((a) => a.status === "cancelled").length,
    };
  },
});

/**
 * Fire an SOS alert.
 *
 * Server-side steps: validate user → basic rate limit → load emergency
 * contacts → build message → create alert + recipients → record location →
 * notify + audit → dispatch through the (pluggable) notify service.
 */
export const triggerSOS = mutation({
  args: {
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    locationLabel: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);

    // Basic rate limiting — one alert per 10 seconds.
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

    const contacts = (
      await ctx.db
        .query("emergencyContacts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    ).sort((a, b) => a.priority - b.priority);

    const hasCoords = args.lat !== undefined && args.lng !== undefined;
    const label =
      args.locationLabel?.trim() ||
      (hasCoords ? `${args.lat!.toFixed(5)}, ${args.lng!.toFixed(5)}` : "Unknown location");
    const link = hasCoords ? mapLink(args.lat!, args.lng!) : undefined;

    const message = buildEmergencyMessage({
      userName: user.name ?? "a EAlert user",
      locationLabel: label,
      mapLink: link,
    });

    const alertId = await ctx.db.insert("alerts", {
      userId,
      type: "sos",
      status: "sent",
      message,
      triggeredAt: Date.now(),
      lat: hasCoords ? args.lat : undefined,
      lng: hasCoords ? args.lng : undefined,
      accuracy: args.accuracy,
      locationLabel: label,
      locationShared: hasCoords,
      recipientsCount: contacts.length,
      note: args.note?.trim()?.slice(0, 300) || undefined,
      channel: "demo",
    });

    const recipients = contacts.map((c) => ({
      alertId,
      contactId: c._id,
      contactName: c.name,
      phone: c.phone,
      email: c.email,
      status: "sent" as const,
      sentAt: Date.now(),
    }));
    for (const r of recipients) {
      await ctx.db.insert("alertRecipients", r);
    }

    if (hasCoords) {
      await ctx.db.insert("locations", {
        userId,
        lat: args.lat!,
        lng: args.lng!,
        accuracy: args.accuracy,
        source: "sos",
        label,
        createdAt: Date.now(),
      });
    }

    const dispatch = await dispatchEmergencyAlert(ctx, {
      userName: user.name ?? "a EAlert user",
      message,
      locationLabel: label,
      mapLink: link,
      recipients: contacts.map((c) => ({ name: c.name, phone: c.phone, email: c.email })),
    });

    await ctx.db.patch(alertId, { channel: dispatch.channel });

    await logActivity(ctx, {
      userId,
      action: "sos_activated",
      result: "success",
      metadata: JSON.stringify({
        alertId,
        recipients: contacts.length,
        channel: dispatch.channel,
        locationShared: hasCoords,
      }),
    });
    await createNotification(ctx, {
      userId,
      type: "sos",
      title: contacts.length
        ? `SOS alert sent to ${contacts.length} contact${contacts.length > 1 ? "s" : ""}`
        : "SOS alert recorded",
      body: contacts.length
        ? `Your emergency alert is on its way to ${contacts.map((c) => c.name).join(", ")}. Stay safe.`
        : "No emergency contacts were notified. Add contacts so help reaches them next time.",
      linkTo: "/alerts",
    });

    return { alertId, recipientsCount: contacts.length, channel: dispatch.channel };
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

    const alertId = await ctx.db.insert("alerts", {
      userId,
      type: "sos",
      status: "cancelled",
      triggeredAt: Date.now(),
      cancelledAt: Date.now(),
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
