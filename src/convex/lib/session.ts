import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Current signed-in user id, or null. */
export async function getUserId(ctx: Ctx) {
  return await getAuthUserId(ctx);
}

/**
 * Current signed-in user, or null when signed out.
 * Disabled accounts are treated as signed out from the app's perspective.
 */
export async function getCurrentUserOrNull(ctx: Ctx) {
  const userId = await getUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;
  return user;
}

/** Requires a signed-in, active user. Throws otherwise. */
export async function requireUser(ctx: Ctx) {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) {
    throw new ConvexError("You need to be signed in to do that.");
  }
  if (user.status === "disabled") {
    throw new ConvexError(
      "This account has been disabled. Contact support for help.",
    );
  }
  return { userId: user._id, user };
}

/** Requires an admin user. Throws otherwise. */
export async function requireAdmin(ctx: Ctx) {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) {
    throw new ConvexError("You need to be signed in to do that.");
  }
  if (user.role !== "admin") {
    throw new ConvexError("Admin access required.");
  }
  return { userId: user._id, user };
}

/** Light input sanitization — trims and caps length. */
export function cleanInput(
  value: string | undefined,
  maxLength = 200,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

export const optionalString = v.optional(v.string());
