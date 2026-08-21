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

/**
 * Require that the user's phone number is verified.
 * Guards: SOS trigger, emergency contacts, community assistance opt-in.
 */
export async function requirePhoneVerified(ctx: Ctx) {
  const { userId, user } = await requireUser(ctx);
  if (user.phoneVerified !== true) {
    throw new ConvexError(
      "Phone verification required. Please verify your phone number in Profile settings.",
    );
  }
  return { userId, user };
}

/**
 * Require that the user's email is verified.
 * Guards: becoming a nearby helper, receiving nearby emergency broadcasts.
 */
export async function requireEmailVerified(ctx: Ctx) {
  const { userId, user } = await requireUser(ctx);
  if (user.emailVerified !== true) {
    throw new ConvexError(
      "Email verification required. Please verify your email in Profile settings.",
    );
  }
  return { userId, user };
}

/**
 * Require both phone and email verified.
 * Guards: full account trust for all safety-critical features.
 */
export async function requireFullyVerified(ctx: Ctx) {
  const { userId, user } = await requireUser(ctx);
  if (user.phoneVerified !== true || user.emailVerified !== true) {
    throw new ConvexError(
      "Account verification required. Please verify both your phone and email in Profile settings.",
    );
  }
  return { userId, user };
}

/**
 * Returns verification status without throwing — for queries that need
 * to show verification state without blocking.
 */
export async function getVerificationStatus(ctx: Ctx) {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) return null;
  return {
    phoneVerified: user.phoneVerified === true,
    emailVerified: user.emailVerified === true,
    fullyVerified:
      user.phoneVerified === true && user.emailVerified === true,
  };
}
