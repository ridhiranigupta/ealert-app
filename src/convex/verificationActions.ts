/**
 * Convex actions for verification delivery.
 *
 * Actions run in the Node.js runtime (not the V8 isolate) so they CAN use
 * fetch(). The mutations that store OTP/token data are in verification.ts —
 * those run in V8 and cannot perform network calls.
 *
 * Flow per verification type:
 *   1. Action calls mutation to store OTP / token in DB.
 *   2. Action calls the external provider via fetch().
 *   3. Action returns the result to the client.
 */

import { action } from "./_generated/server";
import { api } from "./_generated/api";

/* ------------------------------------------------------------------ */
/* Phone OTP                                                           */
/* ------------------------------------------------------------------ */

type PhoneOtpResult =
  | { sent: true; phone: string }
  | { sent: false; error: string };

/** Send a 6-digit OTP to the user's phone via the Freebuff OTP service. */
export const sendPhoneOtp = action({
  args: {},
  handler: async (ctx): Promise<PhoneOtpResult> => {
    // 1. Store the OTP in the DB (runs in V8, has auth context).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await ctx.runMutation(api.verification.sendPhoneOtp);

    if (result.alreadyVerified) {
      return { sent: true, phone: "" };
    }

    const { otp, phone } = result;

    // canonicalPhone strips the '+' prefix — re-add it for the provider
    // which expects E.164 format (+<country><number>).
    const phoneE164 = phone.startsWith("+") ? phone : `+${phone}`;
    const maskedPhone = phoneE164.replace(/(\d{2})\d+(\d{2})/, "$1***$2");

    console.log(
      `[verify] sendPhoneOtp action -> to=${maskedPhone} otp_length=${otp.length}`,
    );

    // 2. Send SMS via fetch (safe in actions).
    try {
      const payload = {
        to: phoneE164,
        otp,
        appName: process.env.VLY_APP_NAME || "a freebuff.com application",
      };
      console.log(
        `[verify] sendPhoneOtp payload -> to=${maskedPhone} appName=${payload.appName}`,
      );

      const res = await fetch("https://auth.freebuff.app/send_otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "fb_email_2crN1hqIArZP2bEfvjp5Qik4",
        },
        body: JSON.stringify(payload),
      });

      console.log(`[verify] sendPhoneOtp action <- status=${res.status}`);
      const body = await res.text();
      console.log(`[verify] sendPhoneOtp action body=${body.slice(0, 300)}`);

      if (!res.ok) {
        console.error(
          `[verify] sendPhoneOtp FAILED status=${res.status} body=${body.slice(0, 500)}`,
        );
        // Surface the provider's actual error message to the client
        let providerMessage = "";
        try {
          const parsed = JSON.parse(body);
          providerMessage = parsed.message || parsed.error || parsed.detail || body;
        } catch {
          providerMessage = body;
        }
        return {
          sent: false,
          error: `Provider error (${res.status}): ${providerMessage.slice(0, 200)}`,
        };
      }

      return { sent: true, phone };
    } catch (err) {
      console.error(`[verify] sendPhoneOtp EXCEPTION:`, err);
      return {
        sent: false,
        error:
          err instanceof Error ? err.message : "Network error sending SMS.",
      };
    }
  },
});

/* ------------------------------------------------------------------ */
/* Email verification                                                  */
/* ------------------------------------------------------------------ */

type EmailVerificationResult =
  | { sent: true; email: string }
  | { sent: false; error: string };

/** Send a verification email with a secure token. */
export const sendEmailVerification = action({
  args: {},
  handler: async (ctx): Promise<EmailVerificationResult> => {
    // 1. Store the token in the DB.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await ctx.runMutation(api.verification.sendEmailVerification);

    if (result.alreadyVerified) {
      return { sent: true, email: "" };
    }

    const { token, email } = result;
    const maskedEmail = email.replace(/(.{2}).+(@.+)/, "$1***$2");

    console.log(`[verify] sendEmailVerification action -> to=${maskedEmail}`);

    // 2. Send email via fetch.
    try {
      const res = await fetch("https://auth.freebuff.app/send_otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "fb_email_2crN1hqIArZP2bEfvjp5Qik4",
        },
        body: JSON.stringify({
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a freebuff.com application",
        }),
      });

      console.log(
        `[verify] sendEmailVerification action <- status=${res.status}`,
      );
      const body = await res.text();
      console.log(
        `[verify] sendEmailVerification action body=${body.slice(0, 300)}`,
      );

      if (!res.ok) {
        console.error(
          `[verify] sendEmailVerification FAILED status=${res.status} body=${body.slice(0, 500)}`,
        );
        // Surface the provider's actual error message to the client
        let providerMessage = "";
        try {
          const parsed = JSON.parse(body);
          providerMessage = parsed.message || parsed.error || parsed.detail || body;
        } catch {
          providerMessage = body;
        }
        return {
          sent: false,
          error: `Provider error (${res.status}): ${providerMessage.slice(0, 200)}`,
        };
      }

      return { sent: true, email };
    } catch (err) {
      console.error(`[verify] sendEmailVerification EXCEPTION:`, err);
      return {
        sent: false,
        error:
          err instanceof Error
            ? err.message
            : "Network error sending email.",
      };
    }
  },
});
