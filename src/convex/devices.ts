import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/session";
import { logActivity } from "./services/activity";
import { providerStatus } from "./services/notify";

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
export const registerDevice = mutation({
  args: {
    token: v.string(),
    platform: v.optional(v.union(v.literal("web"), v.literal("android"), v.literal("ios"))),
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
      });
      return { id: existing._id, registered: false };
    }

    const id = await ctx.db.insert("devices", {
      userId,
      token,
      platform,
      lastSeenAt: now,
      revoked: false,
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

/** Whether push infrastructure is configured (no secrets). */
export const pushStatus = query({
  args: {},
  handler: async () => {
    const p = providerStatus();
    return p.push;
  },
});
