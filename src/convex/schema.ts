import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
);
export type Role = Infer<typeof roleValidator>;

export const USER_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
} as const;

export const userStatusValidator = v.union(
  v.literal(USER_STATUS.ACTIVE),
  v.literal(USER_STATUS.DISABLED),
);
export type UserStatus = Infer<typeof userStatusValidator>;

/** Alert types. Version 1 ships SOS; others are reserved for later. */
export const ALERT_TYPES = {
  SOS: "sos",
  PANIC: "panic",
  MEDICAL: "medical",
  TEST: "test",
} as const;

export const alertTypeValidator = v.union(
  v.literal(ALERT_TYPES.SOS),
  v.literal(ALERT_TYPES.PANIC),
  v.literal(ALERT_TYPES.MEDICAL),
  v.literal(ALERT_TYPES.TEST),
);
export type AlertType = Infer<typeof alertTypeValidator>;

/**
 * Alert lifecycle — every transition is computed server-side:
 *   sending → queued | partially_delivered | delivered | failed
 *   sending → cancelled (user aborted before transmission)
 * `sent` is kept for backward compatibility with pre-upgrade rows.
 */
export const ALERT_STATUSES = {
  SENDING: "sending",
  QUEUED: "queued",
  SENT: "sent",
  PARTIALLY_DELIVERED: "partially_delivered",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export const alertStatusValidator = v.union(
  v.literal(ALERT_STATUSES.SENDING),
  v.literal(ALERT_STATUSES.QUEUED),
  v.literal(ALERT_STATUSES.SENT),
  v.literal(ALERT_STATUSES.PARTIALLY_DELIVERED),
  v.literal(ALERT_STATUSES.DELIVERED),
  v.literal(ALERT_STATUSES.CANCELLED),
  v.literal(ALERT_STATUSES.FAILED),
);
export type AlertStatus = Infer<typeof alertStatusValidator>;

/**
 * Per-recipient delivery lifecycle. `queued` means "intent recorded, not
 * yet delivered" — used when no provider is configured so we never claim
 * delivery that did not happen. `retrying` means a previous attempt failed
 * and a retry is scheduled/possible.
 */
export const RECIPIENT_STATUSES = {
  QUEUED: "queued",
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  RETRYING: "retrying",
  FAILED: "failed",
} as const;

export const recipientStatusValidator = v.union(
  v.literal(RECIPIENT_STATUSES.QUEUED),
  v.literal(RECIPIENT_STATUSES.SENDING),
  v.literal(RECIPIENT_STATUSES.SENT),
  v.literal(RECIPIENT_STATUSES.DELIVERED),
  v.literal(RECIPIENT_STATUSES.RETRYING),
  v.literal(RECIPIENT_STATUSES.FAILED),
);
export type RecipientStatus = Infer<typeof recipientStatusValidator>;

/** Notification channels a contact can be reached on. */
export const CONTACT_CHANNELS = {
  SMS: "sms",
  EMAIL: "email",
  PUSH: "push",
} as const;

export const contactChannelValidator = v.union(
  v.literal(CONTACT_CHANNELS.SMS),
  v.literal(CONTACT_CHANNELS.EMAIL),
  v.literal(CONTACT_CHANNELS.PUSH),
);
export type ContactChannel = Infer<typeof contactChannelValidator>;

export const NOTIFICATION_TYPES = {
  SOS: "sos",
  DELIVERY: "delivery",
  CONTACT: "contact",
  SECURITY: "security",
  ACCOUNT: "account",
  LOCATION: "location",
  SYSTEM: "system",
  EMERGENCY: "emergency",
} as const;

export const notificationTypeValidator = v.union(
  v.literal(NOTIFICATION_TYPES.SOS),
  v.literal(NOTIFICATION_TYPES.DELIVERY),
  v.literal(NOTIFICATION_TYPES.CONTACT),
  v.literal(NOTIFICATION_TYPES.SECURITY),
  v.literal(NOTIFICATION_TYPES.ACCOUNT),
  v.literal(NOTIFICATION_TYPES.LOCATION),
  v.literal(NOTIFICATION_TYPES.SYSTEM),
  v.literal(NOTIFICATION_TYPES.EMERGENCY),
);
export type NotificationType = Infer<typeof notificationTypeValidator>;

export const LOCATION_SESSION_STATUSES = {
  ACTIVE: "active",
  STOPPED: "stopped",
  EXPIRED: "expired",
} as const;

export const locationSessionStatusValidator = v.union(
  v.literal(LOCATION_SESSION_STATUSES.ACTIVE),
  v.literal(LOCATION_SESSION_STATUSES.STOPPED),
  v.literal(LOCATION_SESSION_STATUSES.EXPIRED),
);
export type LocationSessionStatus = Infer<typeof locationSessionStatusValidator>;

// Emergency session lifecycle: CREATED/ACTIVE → (LOCATION_ACTIVE, VIDEO_ACTIVE
// as booleans) → RESPONDING → RESOLVED / CANCELLED / EXPIRED.
export const SESSION_STATUSES = {
  ACTIVE: "active",
  RESPONDING: "responding",
  RESOLVED: "resolved",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export const sessionStatusValidator = v.union(
  v.literal(SESSION_STATUSES.ACTIVE),
  v.literal(SESSION_STATUSES.RESPONDING),
  v.literal(SESSION_STATUSES.RESOLVED),
  v.literal(SESSION_STATUSES.CANCELLED),
  v.literal(SESSION_STATUSES.EXPIRED),
);
export type SessionStatus = Infer<typeof sessionStatusValidator>;

// Verified emergency-contact relationship statuses.
export const RELATIONSHIP_STATUSES = {
  PENDING: "pending",
  VERIFIED: "verified",
  DECLINED: "declined",
} as const;

export const relationshipStatusValidator = v.union(
  v.literal(RELATIONSHIP_STATUSES.PENDING),
  v.literal(RELATIONSHIP_STATUSES.VERIFIED),
  v.literal(RELATIONSHIP_STATUSES.DECLINED),
);
export type RelationshipStatus = Infer<typeof relationshipStatusValidator>;

// Per-recipient push delivery state for app-to-app emergency delivery.
export const PUSH_DELIVERY_STATUSES = {
  PENDING: "pending",
  SENT: "sent",
  DELIVERED: "delivered",
  OPENED: "opened",
  ACTIVE: "active",
} as const;

export const pushDeliveryStatusValidator = v.union(
  v.literal(PUSH_DELIVERY_STATUSES.PENDING),
  v.literal(PUSH_DELIVERY_STATUSES.SENT),
  v.literal(PUSH_DELIVERY_STATUSES.DELIVERED),
  v.literal(PUSH_DELIVERY_STATUSES.OPENED),
  v.literal(PUSH_DELIVERY_STATUSES.ACTIVE),
);
export type PushDeliveryStatus = Infer<typeof pushDeliveryStatusValidator>;

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const schema = defineSchema(
  {
    // Default Convex Auth tables (users, sessions, verificationTokens,
    // oauthAccounts). Do not remove.
    ...authTables,

    // User account. `role` and `status` drive authorization.
    users: defineTable({
      name: v.optional(v.string()), // do not remove
      image: v.optional(v.string()), // do not remove
      email: v.optional(v.string()), // do not remove
      emailVerificationTime: v.optional(v.number()), // do not remove
      isAnonymous: v.optional(v.boolean()), // do not remove
      role: v.optional(roleValidator), // do not remove
      phone: v.optional(v.string()),
      status: v.optional(userStatusValidator),
      lastLoginAt: v.optional(v.number()),
    })
      .index("email", ["email"]) // do not remove or modify
      .index("role", ["role"]),

    // Safety profile — private data, only visible to the owner (and to
    // admins for moderation, not in list views).
    profiles: defineTable({
      userId: v.id("users"),
      fullName: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      address: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      country: v.optional(v.string()),
      workplace: v.optional(v.string()),
      fatherName: v.optional(v.string()),
      motherName: v.optional(v.string()),
      dob: v.optional(v.string()),
      gender: v.optional(v.string()),
      bloodGroup: v.optional(v.string()),
      medicalInfo: v.optional(v.string()),
      emergencyNote: v.optional(v.string()),
      photo: v.optional(v.string()),
      setupComplete: v.optional(v.boolean()),
    }).index("by_userId", ["userId"]),

    // Trusted people to contact during an emergency (max 10 per user).
    // `active` contacts are the ones reached by SOS; `channels` is the
    // contact's notification preference (sms / email / push).
    emergencyContacts: defineTable({
      userId: v.id("users"),
      name: v.string(),
      relationship: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      priority: v.number(),
      isPrimary: v.boolean(),
      active: v.optional(v.boolean()),
      channels: v.optional(v.array(contactChannelValidator)),
      image: v.optional(v.string()),
      // App-to-app pairing: set when the contact maps to a registered EAlert
      // account. `verified` is only true after that account ACCEPTS.
      contactUserId: v.optional(v.id("users")),
      verified: v.optional(v.boolean()),
      relationshipId: v.optional(v.id("contactRelationships")),
    }).index("by_userId", ["userId"]),

    // One row per emergency event.
    alerts: defineTable({
      userId: v.id("users"),
      type: alertTypeValidator,
      status: alertStatusValidator,
      clientAlertId: v.optional(v.string()),
      message: v.optional(v.string()),
      triggeredAt: v.number(),
      updatedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      accuracy: v.optional(v.number()),
      locationLabel: v.optional(v.string()),
      locationShared: v.boolean(),
      recipientsCount: v.number(),
      // EAlert users in the configured radius who received a limited
      // "Nearby Emergency" alert (separate from contacts above).
      nearbyHelpersCount: v.optional(v.number()),
      channel: v.optional(v.string()), // "demo" | "sms" | "email" | "push"
      failureReason: v.optional(v.string()),
      note: v.optional(v.string()),
      sessionId: v.optional(v.id("emergencySessions")),
    })
      .index("by_userId", ["userId"])
      .index("by_status", ["status"])
      .index("by_clientAlertId", ["clientAlertId"]),

    // Per-contact delivery record for an alert. Statuses and provider
    // references reflect the real outcome of each attempt — nothing is
    // marked "delivered" unless a provider confirms it.
    alertRecipients: defineTable({
      alertId: v.id("alerts"),
      contactId: v.optional(v.id("emergencyContacts")),
      contactName: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      status: recipientStatusValidator,
      channel: v.optional(v.string()),
      provider: v.optional(v.string()),
      providerMessageId: v.optional(v.string()),
      error: v.optional(v.string()),
      attempts: v.optional(v.number()),
      sentAt: v.number(),
      deliveredAt: v.optional(v.number()),
      lastAttemptAt: v.optional(v.number()),
      updatedAt: v.optional(v.number()),
      // App-to-app delivery state for verified EAlert recipients.
      recipientUserId: v.optional(v.id("users")),
      pushStatus: v.optional(pushDeliveryStatusValidator),
      openedAt: v.optional(v.number()),
      respondedAt: v.optional(v.number()),
    }).index("by_alertId", ["alertId"]),

    // Location check-ins and SOS coords.
    locations: defineTable({
      userId: v.id("users"),
      lat: v.number(),
      lng: v.number(),
      accuracy: v.optional(v.number()),
      source: v.string(), // "gps" | "sos" | "manual"
      label: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_userId", ["userId"]),

    // Explicit, consent-based location sharing sessions. Browsers cannot
    // guarantee background tracking — sessions only stay alive while the
    // tab is open and expire after `timeoutMinutes` unless extended.
    locationSessions: defineTable({
      userId: v.id("users"),
      startedAt: v.number(),
      lastUpdatedAt: v.number(),
      timeoutMinutes: v.number(),
      status: locationSessionStatusValidator,
    })
      .index("by_userId", ["userId"])
      .index("by_userId_status", ["userId", "status"]),

    // Latest known location per user — a single upserted row per account.
    // Only written when the user explicitly shares a location (Location
    // page or an SOS with coordinates), which doubles as the opt-in for
    // being discoverable by the nearby-helper radius search. No history is
    // kept here; history lives in `locations`.
    userLocations: defineTable({
      userId: v.id("users"),
      lat: v.number(),
      lng: v.number(),
      accuracy: v.optional(v.number()),
      updatedAt: v.number(),
    }).index("by_userId", ["userId"]),

    // Browser push / device registrations (tokens are stored for future
    // push delivery; never sent to the client of another user).
    devices: defineTable({
      userId: v.id("users"),
      token: v.string(),
      platform: v.string(), // "web" | "android" | "ios"
      lastSeenAt: v.number(),
      revoked: v.optional(v.boolean()),
      notificationPermissionStatus: v.optional(v.string()),
      pushEnabled: v.optional(v.boolean()),
      updatedAt: v.optional(v.number()),
    })
      .index("by_userId", ["userId"])
      .index("by_token", ["token"]),

    // In-app notification center.
    notifications: defineTable({
      userId: v.id("users"),
      type: notificationTypeValidator,
      title: v.string(),
      body: v.string(),
      read: v.boolean(),
      createdAt: v.number(),
      linkTo: v.optional(v.string()),
    })
      .index("by_userId", ["userId"])
      .index("by_userId_read", ["userId", "read"]),

    // Audit trail for security-sensitive actions.
    activityLogs: defineTable({
      userId: v.id("users"),
      action: v.string(),
      result: v.string(), // "success" | "failed" | "cancelled" | "blocked"
      metadata: v.optional(v.string()), // small JSON payload
      device: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_userId", ["userId"])
      .index("by_action", ["action"]),

    // Verified contact relationship — app-to-app emergency access is gated
    // on this. User B must ACCEPT before any emergency data flows to them.
    contactRelationships: defineTable({
      userId: v.id("users"),
      contactUserId: v.id("users"),
      emergencyContactId: v.id("emergencyContacts"),
      status: relationshipStatusValidator,
      invitedAt: v.number(),
      respondedAt: v.optional(v.number()),
    })
      .index("by_userId", ["userId"])
      .index("by_contactUserId", ["contactUserId"])
      .index("by_pair", ["userId", "contactUserId"]),

    // One emergency session per SOS alert — the lifecycle of an active
    // emergency (location stream, video, responding, resolution).
    emergencySessions: defineTable({
      userId: v.id("users"),
      alertId: v.id("alerts"),
      status: sessionStatusValidator,
      startedAt: v.number(),
      updatedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      endedBy: v.optional(v.id("users")),
      locationActive: v.boolean(),
      videoActive: v.boolean(),
      responderId: v.optional(v.id("users")),
      responderName: v.optional(v.string()),
      responderLocationShared: v.optional(v.boolean()),
      expiresAt: v.optional(v.number()),
    })
      .index("by_userId", ["userId"])
      .index("by_alertId", ["alertId"])
      .index("by_status", ["status"]),

    // Authorized live-location points during an active emergency session.
    // Never exposed through public URLs — access is per-request authorized.
    emergencyLocations: defineTable({
      sessionId: v.id("emergencySessions"),
      userId: v.id("users"),
      lat: v.number(),
      lng: v.number(),
      accuracy: v.optional(v.number()),
      timestamp: v.number(),
      source: v.string(), // "owner" | "responder"
    })
      .index("by_sessionId", ["sessionId"])
      .index("by_sessionId_time", ["sessionId", "timestamp"]),

    // Live emergency video (WebRTC/LiveKit). No video bytes are stored —
    // only the room reference and lifecycle. Join tokens are generated
    // server-side per request and are never persisted.
    videoSessions: defineTable({
      emergencySessionId: v.id("emergencySessions"),
      provider: v.string(),
      roomId: v.string(),
      status: v.union(v.literal("active"), v.literal("ended")),
      createdBy: v.id("users"),
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
      expiresAt: v.optional(v.number()),
    }).index("by_emergencySessionId", ["emergencySessionId"]),

    // Limited "Nearby Emergency" broadcasts. One row per nearby EAlert
    // user notified about a session. These users are NOT emergency
    // contacts: they can see the emergency location while the session is
    // active and can offer help, but they can never see video, audio,
    // phone numbers or owner controls.
    //
    // Privacy: the row never stores the emergency's exact coordinates.
    // Location visibility is derived from the session's live stream and is
    // revoked as soon as the session ends (getSession returns no location
    // for helpers, and responder coordinates are cleared on end).
    emergencyHelpers: defineTable({
      sessionId: v.id("emergencySessions"),
      alertId: v.id("alerts"),
      userId: v.id("users"),
      ownerId: v.id("users"),
      ownerFirstName: v.string(),
      distanceMeters: v.number(),
      status: v.union(v.literal("notified"), v.literal("responding")),
      createdAt: v.number(),
      respondedAt: v.optional(v.number()),
      // Helper opt-in to share their own live location while responding.
      // Cleared (null) when the session ends.
      shareLocation: v.optional(v.boolean()),
      responderLat: v.optional(v.union(v.number(), v.null())),
      responderLng: v.optional(v.union(v.number(), v.null())),
      responderAccuracy: v.optional(v.union(v.number(), v.null())),
      responderUpdatedAt: v.optional(v.number()),
    })
      .index("by_sessionId", ["sessionId"])
      .index("by_userId", ["userId"])
      .index("by_sessionId_userId", ["sessionId", "userId"])
      .index("by_alertId", ["alertId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
