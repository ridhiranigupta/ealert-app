import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/session";
import { logActivity } from "./services/activity";
import { createNotification } from "./services/notifications";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function generateOtp(): string {
  const random: RandomReader = {
    read(bytes: Uint8Array) {
      crypto.getRandomValues(bytes);
    },
  };
  return generateRandomString(random, "0123456789", 6);
}

function generateToken(): string {
  const random: RandomReader = {
    read(bytes: Uint8Array) {
      crypto.getRandomValues(bytes);
    },
  };
  return generateRandomString(
    random,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    48,
  );
}

/** OTP expires after 10 minutes. */
const OTP_MAX_AGE_MS = 10 * 60 * 1000;
/** Email token expires after 24 hours. */
const EMAIL_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** Return the current verification status for the signed-in user. */
export const getVerificationStatus = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    return {
      phoneVerified: user.phoneVerified === true,
      emailVerified: user.emailVerified === true,
      phone: user.phone ?? null,
      email: user.email ?? null,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Phone verification                                                  */
/* ------------------------------------------------------------------ */

/**
 * Store a 6-digit phone OTP (data-only — no network call).
 * Called internally by the sendPhoneOtp action.
 */
export const sendPhoneOtp = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireUser(ctx);

    if (user.phoneVerified === true) {
      return { alreadyVerified: true };
    }

    if (!user.phone) {
      throw new ConvexError(
        "No phone number on file. Add one in your profile first.",
      );
    }

    const otp = generateOtp();
    const now = Date.now();

    // Clean up any previous phone OTPs for this user.
    const existing = await ctx.db
      .query("phoneOtpCodes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.insert("phoneOtpCodes", {
      userId,
      code: otp,
      expiresAt: now + OTP_MAX_AGE_MS,
    });

    return { otp, phone: user.phone };
  },
});

/** Verify the 6-digit phone OTP. */
export const verifyPhoneOtp = mutation({
  args: { otp: v.string() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);

    if (user.phoneVerified === true) {
      return { alreadyVerified: true };
    }

    if (args.otp.length !== 6 || !/^\d{6}$/.test(args.otp)) {
      throw new ConvexError("Invalid verification code.");
    }

    const now = Date.now();

    // Find the most recent OTP for this user.
    const records = await ctx.db
      .query("phoneOtpCodes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Sort descending by creation time (most recent first).
    records.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));

    const record = records[0];
    if (!record) {
      throw new ConvexError(
        "No verification code found. Please request a new one.",
      );
    }

    if (now > record.expiresAt) {
      await ctx.db.delete(record._id);
      throw new ConvexError("Verification code expired. Request a new one.");
    }

    if (record.code !== args.otp) {
      throw new ConvexError("Incorrect verification code. Please try again.");
    }

    // OTP matches — mark phone as verified.
    await ctx.db.patch(userId, { phoneVerified: true });
    await ctx.db.delete(record._id);

    // Clean up any remaining OTPs.
    for (const r of records.slice(1)) {
      await ctx.db.delete(r._id);
    }

    await logActivity(ctx, {
      userId,
      action: "phone_verified",
      result: "success",
    });

    await createNotification(ctx, {
      userId,
      type: "security",
      title: "Phone verified",
      body: "Your phone number has been verified. You can now use SOS and emergency features.",
      linkTo: "/profile",
    });

    return { verified: true };
  },
});

/* ------------------------------------------------------------------ */
/* Email verification                                                  */
/* ------------------------------------------------------------------ */

/**
 * Store an email verification token (data-only — no network call).
 * Called internally by the sendEmailVerification action.
 */
export const sendEmailVerification = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireUser(ctx);

    if (user.emailVerified === true) {
      return { alreadyVerified: true };
    }

    // Use the email from the auth account (stored on the users table).
    const email = user.email;
    if (!email) {
      throw new ConvexError(
        "No email address on file. Your account email is used for verification.",
      );
    }

    const token = generateOtp();
    const now = Date.now();

    // Clean up any previous email verification tokens for this user.
    const existing = await ctx.db
      .query("emailVerifyTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.insert("emailVerifyTokens", {
      userId,
      token,
      expiresAt: now + EMAIL_TOKEN_MAX_AGE_MS,
    });

    return { token, email };
  },
});

/** Verify the email verification token. */
export const verifyEmailToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);

    if (user.emailVerified === true) {
      return { alreadyVerified: true };
    }

    if (args.token.length !== 6 || !/^\d{6}$/.test(args.token)) {
      throw new ConvexError("Invalid verification code.");
    }

    const now = Date.now();

    const records = await ctx.db
      .query("emailVerifyTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    records.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));

    const record = records[0];
    if (!record) {
      throw new ConvexError(
        "No verification token found. Please request a new one.",
      );
    }

    if (now > record.expiresAt) {
      await ctx.db.delete(record._id);
      throw new ConvexError("Verification token expired. Request a new one.");
    }

    if (record.token !== args.token) {
      throw new ConvexError("Incorrect verification token. Please try again.");
    }

    // Token matches — mark email as verified.
    await ctx.db.patch(userId, { emailVerified: true });
    await ctx.db.delete(record._id);

    // Clean up remaining tokens.
    for (const r of records.slice(1)) {
      await ctx.db.delete(r._id);
    }

    await logActivity(ctx, {
      userId,
      action: "email_verified",
      result: "success",
    });

    await createNotification(ctx, {
      userId,
      type: "security",
      title: "Email verified",
      body: "Your email has been verified. You're now eligible to receive nearby emergency alerts.",
      linkTo: "/profile",
    });

    return { verified: true };
  },
});
