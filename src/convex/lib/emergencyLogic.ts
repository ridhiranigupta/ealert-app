import type { PushDeliveryStatus, SessionStatus } from "../schema";

/* ------------------------------------------------------------------ */
/* Emergency session access (pure)                                     */
/* ------------------------------------------------------------------ */

export type SessionAccessRole = "owner" | "verified_contact" | "admin";

/**
 * Authorization matrix for an emergency session.
 * Owner → full access. Verified contact → full access (explicitly added and
 * accepted by the owner). Admin → limited access only (never precise live
 * location by default). Anyone else → no access.
 */
export function canAccessEmergencySession(opts: {
  isOwner: boolean;
  isVerifiedContact: boolean;
  role?: string | null;
}): SessionAccessRole | null {
  if (opts.isOwner) return "owner";
  if (opts.isVerifiedContact) return "verified_contact";
  if (opts.role === "admin") return "admin";
  return null;
}

/* ------------------------------------------------------------------ */
/* Emergency push payload (pure)                                       */
/* ------------------------------------------------------------------ */

export interface EmergencyPushPayload {
  notification: { title: string; body: string };
  data: { type: "emergency"; alertId: string; sessionId: string };
}

/**
 * Build the app-to-app push notification.
 *
 * Privacy rule: the payload NEVER contains coordinates, profile details,
 * medical information or contact lists. Recipients open the session and
 * fetch authorized details from the backend after authentication.
 */
export function buildEmergencyPushPayload(opts: {
  userName: string;
  alertId: string;
  sessionId: string;
}): EmergencyPushPayload {
  return {
    notification: {
      title: "🚨 EAlert Emergency",
      body: `${opts.userName} has activated an emergency alert. Tap to open the emergency session.`,
    },
    data: {
      type: "emergency",
      alertId: opts.alertId,
      sessionId: opts.sessionId,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Session lifecycle (pure)                                            */
/* ------------------------------------------------------------------ */

const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  active: ["responding", "resolved", "cancelled", "expired"],
  responding: ["active", "resolved", "cancelled", "expired"],
  resolved: [],
  cancelled: [],
  expired: [],
};

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/* ------------------------------------------------------------------ */
/* Recipient push status (pure — never upgraded without evidence)      */
/* ------------------------------------------------------------------ */

/**
 * Map real delivery evidence to the app-to-app recipient status:
 *   - responding  → "active"
 *   - opened      → "opened"
 *   - provider accepted the message → "sent"
 *   - anything else → "pending"
 * "delivered" is reserved for a future device-level delivery receipt and is
 * never set from a send acknowledgement alone.
 */
export function recipientPushStatus(opts: {
  responding: boolean;
  opened: boolean;
  providerAccepted: boolean;
}): PushDeliveryStatus {
  if (opts.responding) return "active";
  if (opts.opened) return "opened";
  if (opts.providerAccepted) return "sent";
  return "pending";
}
