import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/session";
import { logActivity } from "./services/activity";
import { pushProviderStatus } from "./services/push";

const TOKEN_MIN = 10;
const TOKEN_MAX = 512;

function cleanToken(token: string): string | null {
  const t = token.trim();
  if (t.length < TOKEN_MIN || t.length > TOKEN_MAX) return null;
  // Tokens are opaque strings — reject anything that isn't URL-safe.
  if (!/^[A-Za-z0-9:_\-\.=~+/%]+$/.test(t)) return null;
  return t;
}

/**
 * Register a device token for future push delivery. Tokens are stored
 * server-side only. Actual push sending requires PUSH_PROVIDER + VAPID
 * credentials (see services/notify.ts) — until then the registration is
 * recorded but no delivery is claimed.
 */
const webSubscriptionValidator = v.object({
  endpoint: v.string(),
  keys: v.object({
    p256dh: v.string(),
    auth: v.string(),
  }),
});

export const registerDevice = mutation({
  args: {
    token: v.string(),
    platform: v.optional(v.union(v.literal("web"), v.literal("android"), v.literal("ios"))),
    pushEnabled: v.optional(v.boolean()),
    notificationPermissionStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const token = cleanToken(args.token);
    if (!token) {
      throw new ConvexError("Device token is invalid.");
    }
    const platform = args.platform ?? "web";
    const now = Date.now();

    const existing = await ctx.db
      .query("devices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (existing) {
      // Re-register (token rotation / re-login).
      await ctx.db.patch(existing._id, {
        userId,
        platform,
        lastSeenAt: now,
        revoked: false,
        pushEnabled: args.pushEnabled ?? existing.pushEnabled ?? true,
        notificationPermissionStatus:
          args.notificationPermissionStatus ?? existing.notificationPermissionStatus,
        updatedAt: now,
      });
      return { id: existing._id, registered: false };
    }

    const id = await ctx.db.insert("devices", {
      userId,
      token,
      platform,
      lastSeenAt: now,
      revoked: false,
      pushEnabled: args.pushEnabled ?? true,
      notificationPermissionStatus: args.notificationPermissionStatus,
      updatedAt: now,
    });
    await logActivity(ctx, {
      userId,
      action: "device_registered",
      result: "success",
      metadata: JSON.stringify({ platform }),
    });
    return { id, registered: true };
  },
});

/**
 * Register a browser Web Push subscription (endpoint + keys). The token is
 * stored as the serialized subscription JSON. Delivery requires VAPID keys
 * server-side; until then the registration is recorded honestly.
 */
export const registerWebSubscription = mutation({
  args: {
    subscription: webSubscriptionValidator,
    notificationPermissionStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const token = JSON.stringify(args.subscription);
    if (token.length < 20 || token.length > 1024) {
      throw new ConvexError("Invalid push subscription.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        platform: "web",
        lastSeenAt: now,
        revoked: false,
        pushEnabled: true,
        notificationPermissionStatus:
          args.notificationPermissionStatus ?? existing.notificationPermissionStatus,
        updatedAt: now,
      });
      return { id: existing._id, registered: false };
    }

    const id = await ctx.db.insert("devices", {
      userId,
      token,
      platform: "web",
      lastSeenAt: now,
      revoked: false,
      pushEnabled: true,
      notificationPermissionStatus: args.notificationPermissionStatus,
      updatedAt: now,
    });
    await logActivity(ctx, {
      userId,
      action: "device_registered",
      result: "success",
      metadata: JSON.stringify({ platform: "web" }),
    });
    return { id, registered: true };
  },
});

/** Keep the stored notification permission status in sync with the browser. */
export const updatePermissionStatus = mutation({
  args: { status: v.string(), pushEnabled: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const d of devices) {
      await ctx.db.patch(d._id, {
        notificationPermissionStatus: args.status,
        pushEnabled: args.pushEnabled ?? d.pushEnabled ?? true,
        updatedAt: Date.now(),
      });
    }
    return devices.length;
  },
});

export const revokeDevice = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const device = await ctx.db
      .query("devices")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!device || device.userId !== userId) {
      throw new ConvexError("Device not found.");
    }
    await ctx.db.patch(device._id, { revoked: true });
    return true;
  },
});

export const listMyDevices = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    // Never return raw tokens back to the UI — mask them.
    return devices.map((d) => ({
      _id: d._id,
      platform: d.platform,
      lastSeenAt: d.lastSeenAt,
      revoked: d.revoked ?? false,
      maskedToken: `${d.token.slice(0, 6)}…${d.token.slice(-4)}`,
    }));
  },
});

/**
 * Whether push infrastructure is configured (no secrets).
 * `vapidPublicKey` is a public key — safe to expose for browser
 * subscriptions. Delivery is only claimed when a provider is configured.
 */
export const pushStatus = query({
  args: {},
  handler: async () => {
    const p = pushProviderStatus();
    return {
      configured: p.configured,
      provider: p.provider,
      vapidPublicKey: p.vapidPublicKey ?? null,
    };
  },
});
