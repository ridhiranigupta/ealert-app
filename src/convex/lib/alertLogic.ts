import type { AlertStatus, RecipientStatus } from "../schema";

/* ------------------------------------------------------------------ */
/* Emergency message generation (pure)                                 */
/* ------------------------------------------------------------------ */

export interface MessageInput {
  userName: string;
  locationLabel?: string;
  mapLink?: string;
  note?: string;
  /** Epoch ms. Defaults to "now" but injectable for tests. */
  timestamp?: number;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * Build the three message variants shared with emergency contacts.
 * SMS keeps it compact; email/push carry the timestamp and optional note.
 * No private fields (blood group, address, family details) are included.
 */
export function buildEmergencyMessages(input: MessageInput): {
  sms: string;
  email: string;
  push: string;
} {
  const when = formatTimestamp(input.timestamp ?? Date.now());
  const location = input.mapLink ?? input.locationLabel ?? "Unknown location";
  const noteLine = input.note?.trim() ? `\n\nNote: ${input.note.trim()}` : "";

  const sms = [
    `EMERGENCY ALERT from ${input.userName}.`,
    `I may need immediate assistance.`,
    `Location: ${location}`,
  ].join("\n");

  const email = [
    `EMERGENCY ALERT from ${input.userName}.`,
    ``,
    `I may need immediate assistance.`,
    ``,
    `Time: ${when}`,
    `Location: ${location}`,
    noteLine,
    ``,
    `Please contact me or local emergency services if appropriate.`,
  ].join("\n");

  const push = `${input.userName} needs help — ${location}${noteLine ? ` — ${noteLine}` : ""}`.trim();

  return { sms, email, push };
}

/* ------------------------------------------------------------------ */
/* Phone validation (pure)                                             */
/* ------------------------------------------------------------------ */

/** Normalize a phone string to digits (plus prefix kept). */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\D/g, "")}` : digits.replace(/\D/g, "");
}

/**
 * Canonical form used for account matching: bare digits, no "+".
 * `normalizePhone` keeps the "+" only when the caller typed one, which
 * makes exact-match comparisons direction-dependent (+1555… vs 1555…).
 * Dropping the "+" gives one deterministic form for both sides.
 */
export function canonicalPhone(input: string): string {
  return input.replace(/\D/g, "");
}

export interface PhoneCheck {
  ok: boolean;
  normalized: string;
  reason?: string;
}

/**
 * Lenient-but-real phone validation. Accepts 7–15 digits (with optional
 * leading +). Rejects empty / obviously invalid numbers.
 */
export function validatePhone(input: string): PhoneCheck {
  const normalized = normalizePhone(input);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 0) {
    return { ok: false, normalized, reason: "Phone number is required." };
  }
  if (digits.length < 7 || digits.length > 15) {
    return {
      ok: false,
      normalized,
      reason: "Phone number must be 7–15 digits (e.g. +1 555 000 1234).",
    };
  }
  return { ok: true, normalized };
}

/* ------------------------------------------------------------------ */
/* Idempotency key validation (pure)                                   */
/* ------------------------------------------------------------------ */

/** Client-generated alert IDs must be safe tokens (no user input). */
export function validateClientAlertId(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(value);
}

/** Generate a client-side idempotency key with a safe fallback. */
export function makeClientAlertId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sos-${crypto.randomUUID()}`;
  }
  return `sos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ */
/* Alert status computation (pure)                                     */
/* ------------------------------------------------------------------ */

/**
 * Derive the alert status from its recipients' delivery outcomes.
 * Never upgrades an alert to "delivered" unless every recipient was
 * confirmed delivered; a single failure yields PARTIALLY_DELIVERED.
 */
export function computeAlertStatus(
  recipientStatuses: RecipientStatus[],
): AlertStatus {
  if (recipientStatuses.length === 0) return "queued";

  const delivered = recipientStatuses.filter((s) => s === "delivered").length;
  const failed = recipientStatuses.filter((s) => s === "failed").length;
  const inFlight = recipientStatuses.filter(
    (s) => s === "sending" || s === "retrying" || s === "sent",
  ).length;
  const pending = recipientStatuses.filter((s) => s === "queued").length;

  if (delivered === recipientStatuses.length) return "delivered";
  if (failed === recipientStatuses.length) return "failed";
  if (delivered > 0 && failed > 0) return "partially_delivered";
  if (inFlight > 0) return "sending";
  if (delivered > 0 && pending > 0) return "partially_delivered";
  return "queued";
}

/* ------------------------------------------------------------------ */
/* Contact dedupe (pure)                                               */
/* ------------------------------------------------------------------ */

/**
 * True when `phone` already exists among `existing`.
 * Compares the full digit sequence (country code included) so formatting,
 * separators and an optional leading "+" can never bypass the check.
 */
export function isDuplicatePhone(
  existing: { phone: string }[],
  phone: string,
): boolean {
  const digits = normalizePhone(phone).replace(/[^\d]/g, "");
  if (!digits) return false;
  return existing.some((c) => normalizePhone(c.phone).replace(/[^\d]/g, "") === digits);
}

/** Channels a contact can be notified on, defaulting to SMS when email absent. */
export function effectiveChannels(contact: {
  email?: string | null;
  channels?: string[] | null;
}): ("sms" | "email" | "push")[] {
  const preferred = (contact.channels ?? []) as ("sms" | "email" | "push")[];
  if (preferred.length > 0) {
    return [...new Set(preferred)];
  }
  return contact.email ? ["sms", "email"] : ["sms"];
}
