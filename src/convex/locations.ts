import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/session";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";

/**
 * Keep the single-row `userLocations` table in sync with the user's latest
 * known position. This row is the discoverability signal for the
 * nearby-helper radius search — only users who explicitly share a location
 * (here or via SOS) are ever considered "nearby".
 */
export async function upsertUserLocation(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    lat: number;
    lng: number;
    accuracy?: number;
    updatedAt?: number;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("userLocations")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .first();
  const updatedAt = args.updatedAt ?? Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      updatedAt,
    });
  } else {
    await ctx.db.insert("userLocations", {
      userId: args.userId,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      updatedAt,
    });
  }
}

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    return await ctx.db
      .query("locations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
  },
});

export const history = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    return await ctx.db
      .query("locations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);
  },
});

export const save = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    label: v.optional(v.string()),
    source: v.optional(v.union(v.literal("gps"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const now = Date.now();

    // Avoid writing duplicate rows from rapid refreshes.
    const last = await ctx.db
      .query("locations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (
      last &&
      Math.abs(last.lat - args.lat) < 0.0001 &&
      Math.abs(last.lng - args.lng) < 0.0001 &&
      now - last.createdAt < 60_000
    ) {
      return { id: last._id, duplicate: true };
    }

    const id = await ctx.db.insert("locations", {
      userId,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      source: args.source ?? "gps",
      label: args.label?.trim().slice(0, 200) || undefined,
      createdAt: now,
    });
    await upsertUserLocation(ctx, { userId, lat: args.lat, lng: args.lng, accuracy: args.accuracy, updatedAt: now });

    await logActivity(ctx, {
      userId,
      action: "location_shared",
      result: "success",
      metadata: JSON.stringify({ source: args.source ?? "gps" }),
    });
    await createNotification(ctx, {
      userId,
      type: "location",
      title: "Location shared",
      body: "Your current location was recorded. You can share it from the Location page anytime.",
      linkTo: "/location",
    });

    return { id, duplicate: false };
  },
});
