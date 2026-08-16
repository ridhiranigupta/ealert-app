import type { PushDeliveryStatus, SessionStatus } from "../schema";

/* ------------------------------------------------------------------ */
/* Emergency session access (pure)                                     */
/* ------------------------------------------------------------------ */

export type SessionAccessRole =
  | "owner"
  | "verified_contact"
  | "helper_nearby"
  | "admin";

/**
 * Authorization matrix for an emergency session.
 *   owner           → full access (location, video, recipients, controls)
 *   verified_contact→ full access (explicitly added and accepted by owner)
 *   helper_nearby   → location ONLY, and only while the session is active.
 *                     Never video, never phone numbers, never owner controls.
 *   admin           → limited access only (never precise live location)
 *   anyone else     → no access
 */
export function canAccessEmergencySession(opts: {
  isOwner: boolean;
  isVerifiedContact: boolean;
  isHelperNearby: boolean;
  role?: string | null;
}): SessionAccessRole | null {
  if (opts.isOwner) return "owner";
  if (opts.isVerifiedContact) return "verified_contact";
  if (opts.isHelperNearby) return "helper_nearby";
  if (opts.role === "admin") return "admin";
  return null;
}

/**
 * Live video is restricted to the owner and verified contacts. Nearby
 * helpers must never obtain video — the server never returns video data
 * (or LiveKit tokens) to them.
 */
export function canAccessEmergencyVideo(role: SessionAccessRole | null): boolean {
  return role === "owner" || role === "verified_contact";
}

/**
 * A nearby helper may see the emergency location ONLY while the session is
 * open (active or responding). As soon as it ends, access is revoked.
 */
export function helperCanSeeLocation(status: string): boolean {
  return status === "active" || status === "responding";
}

/** Rough ETA in whole minutes from a straight-line distance (default ~30 km/h). */
export function estimateEtaMinutes(
  distanceMeters: number,
  speedKmh = 30,
): number {
  if (distanceMeters <= 0) return 0;
  const hours = distanceMeters / 1000 / Math.max(speedKmh, 1);
  return Math.max(1, Math.round(hours * 60));
}

/** First name only — nearby helpers never learn the sender's full name. */
export function ownerFirstName(name: string | undefined | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "An EAlert user";
}

/* ------------------------------------------------------------------ */
/* Geospatial (pure)                                                   */
/* ------------------------------------------------------------------ */

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** True when the point is inside the radius (in meters) around the center. */
export function isWithinRadius(
  centerLat: number,
  centerLng: number,
  pointLat: number,
  pointLng: number,
  radiusMeters: number,
): boolean {
  return haversineMeters(centerLat, centerLng, pointLat, pointLng) <= radiusMeters;
}

/** Compact human distance: "850 m" or "1.2 km". */
export function formatDistanceMeters(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
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
      body: `${opts.userName} needs help right now. Tap to open the emergency session and see their live location and video.`,
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
