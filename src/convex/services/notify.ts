import type { MutationCtx } from "../_generated/server";
import type { RecipientStatus } from "../schema";
import { buildEmergencyMessages } from "../lib/alertLogic";

/**
 * Emergency message dispatch abstraction.
 *
 * EAlert never claims delivery that did not happen. Delivery status is
 * driven by real provider configuration:
 *
 *   - No SMS/email credentials → every recipient is recorded as `queued`
 *     with error `provider_not_configured`. The alert is stored honestly
 *     (status `queued`) and the UI explains what config is missing.
 *   - Credentials present → a real HTTP call is made to the provider
 *     (Twilio SMS / Resend email via plain fetch, no SDK required) and the
 *     per-recipient status reflects the actual API response.
 *
 * Environment variables (never exposed to the browser):
 *   SMS_PROVIDER      (twilio)      SMS_ACCOUNT_ID  SMS_AUTH_TOKEN  SMS_FROM_NUMBER
 *   EMAIL_PROVIDER    (resend)      EMAIL_API_KEY
 *   PUSH_PROVIDER / VAPID keys, MAP_PROVIDER / MAP_API_KEY — reserved.
 */

export interface DispatchRecipient {
  name: string;
  phone: string;
  email?: string;
  /** Channels this contact prefers (sms / email / push). */
  channels?: ("sms" | "email" | "push")[];
}

export interface DispatchArgs {
  userName: string;
  locationLabel?: string;
  mapLink?: string;
  note?: string;
  /** Epoch ms used in the message timestamp. */
  timestamp?: number;
  recipients: DispatchRecipient[];
}

export interface RecipientOutcome {
  status: RecipientStatus;
  channel?: string;
  provider?: string;
  providerMessageId?: string;
  error?: string;
}

export interface DispatchResult {
  /** Primary channel used for the alert ("none" when nothing could be sent). */
  channel: "sms" | "email" | "push" | "none" | "demo";
  outcomes: RecipientOutcome[];
  attempted: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
}

/* ------------------------------------------------------------------ */
/* Provider configuration (read-only, no secrets)                      */
/* ------------------------------------------------------------------ */

export interface ProviderStatus {
  sms: { configured: boolean; provider?: string };
  email: { configured: boolean; provider?: string };
  push: { configured: boolean; provider?: string };
  map: { configured: boolean; provider?: string };
}

export function providerStatus(): ProviderStatus {
  return {
    sms: {
      configured: Boolean(process.env.SMS_ACCOUNT_ID && process.env.SMS_AUTH_TOKEN && process.env.SMS_FROM_NUMBER),
      provider: process.env.SMS_PROVIDER || "twilio",
    },
    email: {
      configured: Boolean(process.env.EMAIL_API_KEY),
      provider: process.env.EMAIL_PROVIDER || "resend",
    },
    push: {
      configured: Boolean(process.env.PUSH_PROVIDER && process.env.VAPID_PUBLIC_KEY),
      provider: process.env.PUSH_PROVIDER || "webpush",
    },
    map: {
      configured: Boolean(process.env.MAP_API_KEY),
      provider: process.env.MAP_PROVIDER || "google-maps",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Real provider adapters (plain fetch, env-guarded)                   */
/* ------------------------------------------------------------------ */

async function sendSmsViaTwilio(opts: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const accountSid = process.env.SMS_ACCOUNT_ID;
  const authToken = process.env.SMS_AUTH_TOKEN;
  const from = process.env.SMS_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    return { ok: false, error: "provider_not_configured" };
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: opts.to, From: from, Body: opts.body }),
      },
    );
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { ok: false, error: `twilio_http_${res.status}: ${text}` };
    }
    const data = (await res.json()) as { sid?: string; status?: string };
    return { ok: true, messageId: data.sid ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "twilio_network_error" };
  }
}

async function sendEmailViaResend(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM ?? "EAlert <alerts@ealert.app>";
  if (!apiKey) {
    return { ok: false, error: "provider_not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, text: opts.text }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { ok: false, error: `resend_http_${res.status}: ${text}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, messageId: data.id ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "resend_network_error" };
  }
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

async function dispatchToRecipient(
  recipient: DispatchRecipient,
  messages: { sms: string; email: string; push: string },
): Promise<RecipientOutcome> {
  const channels: ("sms" | "email" | "push")[] =
    recipient.channels && recipient.channels.length > 0
      ? [...recipient.channels]
      : recipient.email
        ? ["sms", "email"]
        : ["sms"];

  // SMS first (most reliable in an emergency).
  if (channels.includes("sms")) {
    const smsStatus = providerStatus().sms;
    if (!smsStatus.configured) {
      return {
        status: "queued",
        channel: "sms",
        provider: smsStatus.provider,
        error: "provider_not_configured",
      };
    }
    const result = await sendSmsViaTwilio({ to: recipient.phone, body: messages.sms });
    if (result.ok) {
      return {
        status: "sent",
        channel: "sms",
        provider: smsStatus.provider,
        providerMessageId: result.messageId,
      };
    }
    // SMS failed → try email as a fallback channel before giving up.
    if (recipient.email && providerStatus().email.configured) {
      const emailResult = await sendEmailViaResend({
        to: recipient.email,
        subject: "EMERGENCY ALERT — please respond",
        text: messages.email,
      });
      if (emailResult.ok) {
        return {
          status: "sent",
          channel: "email",
          provider: "resend",
          providerMessageId: emailResult.messageId,
        };
      }
      return {
        status: "failed",
        channel: "sms",
        provider: smsStatus.provider,
        error: result.error,
      };
    }
    return { status: "failed", channel: "sms", provider: smsStatus.provider, error: result.error };
  }

  if (channels.includes("email") && recipient.email) {
    const emailStatus = providerStatus().email;
    if (!emailStatus.configured) {
      return {
        status: "queued",
        channel: "email",
        provider: emailStatus.provider,
        error: "provider_not_configured",
      };
    }
    const result = await sendEmailViaResend({
      to: recipient.email,
      subject: "EMERGENCY ALERT — please respond",
      text: messages.email,
    });
    if (result.ok) {
      return {
        status: "sent",
        channel: "email",
        provider: emailStatus.provider,
        providerMessageId: result.messageId,
      };
    }
    return {
      status: "failed",
      channel: "email",
      provider: emailStatus.provider,
      error: result.error,
    };
  }

  if (channels.includes("push")) {
    const pushStatus = providerStatus().push;
    return {
      status: pushStatus.configured ? "queued" : "queued",
      channel: "push",
      provider: pushStatus.provider,
      error: pushStatus.configured ? undefined : "provider_not_configured",
    };
  }

  return { status: "queued", error: "no_channel_available" };
}

/** Dispatch an emergency alert to its recipients. Never lies. */
export async function dispatchEmergencyAlert(
  _ctx: MutationCtx,
  args: DispatchArgs,
): Promise<DispatchResult> {
  const messages = buildEmergencyMessages({
    userName: args.userName,
    locationLabel: args.locationLabel,
    mapLink: args.mapLink,
    note: args.note,
    timestamp: args.timestamp,
  });

  const outcomes: RecipientOutcome[] = [];
  for (const recipient of args.recipients) {
    outcomes.push(await dispatchToRecipient(recipient, messages));
  }

  const attempted = outcomes.length;
  const queued = outcomes.filter((o) => o.status === "queued").length;
  const sent = outcomes.filter((o) => o.status === "sent").length;
  const delivered = outcomes.filter((o) => o.status === "delivered").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;

  const channel: DispatchResult["channel"] =
    sent > 0
      ? (outcomes.find((o) => o.channel)?.channel as DispatchResult["channel"]) ?? "none"
      : queued > 0
        ? "none"
        : "none";

  return { channel, outcomes, attempted, queued, sent, delivered, failed };
}

/* ------------------------------------------------------------------ */
/* Test messages                                                       */
/* ------------------------------------------------------------------ */

/** Send a test notification to a single contact (no alert record). */
export async function dispatchTestMessage(
  _ctx: MutationCtx,
  args: {
    userName: string;
    recipient: DispatchRecipient;
  },
): Promise<RecipientOutcome> {
  const messages = buildEmergencyMessages({
    userName: args.userName,
    locationLabel: "Test location — no alert was triggered",
    timestamp: Date.now(),
  });
  return dispatchToRecipient(args.recipient, messages);
}
