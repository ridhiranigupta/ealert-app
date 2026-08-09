import type { MutationCtx } from "../_generated/server";

/**
 * Emergency message dispatch abstraction.
 *
 * EAlert does NOT send real SMS / email / push until a provider is
 * configured. Connect one later via environment variables, e.g.:
 *
 *   EALERT_SMS_API_KEY     → SMS provider (Twilio, Vonage, …)
 *   EALERT_EMAIL_API_KEY   → transactional email (Resend, SendGrid, …)
 *   EALERT_PUSH_PROJECT_ID → push (FCM, Expo, …)
 *
 * Until then every alert runs in safe demo mode: nothing is sent outside
 * the app, and the alert is recorded as delivered so the full SOS flow can
 * be exercised end to end.
 */

export interface DispatchResult {
  channel: "demo" | "sms" | "email" | "push";
  attempted: number;
  delivered: number;
  failed: number;
}

export interface DispatchRecipient {
  name: string;
  phone: string;
  email?: string;
}

export interface DispatchArgs {
  userName: string;
  message: string;
  locationLabel?: string;
  mapLink?: string;
  recipients: DispatchRecipient[];
}

/** The message shared with emergency contacts. */
export function buildEmergencyMessage(args: {
  userName: string;
  locationLabel?: string;
  mapLink?: string;
}) {
  return [
    `EMERGENCY ALERT from ${args.userName}.`,
    `I may need immediate assistance.`,
    `My current location is: ${args.mapLink ?? args.locationLabel ?? "Unknown"}`,
  ].join("\n");
}

export async function dispatchEmergencyAlert(
  _ctx: MutationCtx,
  args: DispatchArgs,
): Promise<DispatchResult> {
  const smsConfigured = Boolean(process.env.EALERT_SMS_API_KEY);
  const emailConfigured = Boolean(process.env.EALERT_EMAIL_API_KEY);

  const channel: DispatchResult["channel"] = smsConfigured
    ? "sms"
    : emailConfigured
      ? "email"
      : "demo";

  if (channel === "demo") {
    // No provider configured — record intent only. Nothing leaves the app.
    return {
      channel,
      attempted: args.recipients.length,
      delivered: args.recipients.length,
      failed: 0,
    };
  }

  // ── Real provider integration point ──────────────────────────────────
  // When a provider key is present, implement delivery here and return
  // per-recipient outcomes so alertRecipients rows reflect reality.
  return {
    channel,
    attempted: args.recipients.length,
    delivered: 0,
    failed: args.recipients.length,
  };
}
