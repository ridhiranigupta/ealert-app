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

export const ALERT_STATUSES = {
  SENT: "sent",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export const alertStatusValidator = v.union(
  v.literal(ALERT_STATUSES.SENT),
  v.literal(ALERT_STATUSES.DELIVERED),
  v.literal(ALERT_STATUSES.CANCELLED),
  v.literal(ALERT_STATUSES.FAILED),
);
export type AlertStatus = Infer<typeof alertStatusValidator>;

export const RECIPIENT_STATUSES = {
  SENT: "sent",
  DELIVERED: "delivered",
  FAILED: "failed",
} as const;

export const recipientStatusValidator = v.union(
  v.literal(RECIPIENT_STATUSES.SENT),
  v.literal(RECIPIENT_STATUSES.DELIVERED),
  v.literal(RECIPIENT_STATUSES.FAILED),
);

export const NOTIFICATION_TYPES = {
  SOS: "sos",
  CONTACT: "contact",
  SECURITY: "security",
  LOCATION: "location",
  SYSTEM: "system",
} as const;

export const notificationTypeValidator = v.union(
  v.literal(NOTIFICATION_TYPES.SOS),
  v.literal(NOTIFICATION_TYPES.CONTACT),
  v.literal(NOTIFICATION_TYPES.SECURITY),
  v.literal(NOTIFICATION_TYPES.LOCATION),
  v.literal(NOTIFICATION_TYPES.SYSTEM),
);
export type NotificationType = Infer<typeof notificationTypeValidator>;

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
      bloodGroup: v.optional(v.string()),
      medicalInfo: v.optional(v.string()),
      emergencyNote: v.optional(v.string()),
      photo: v.optional(v.string()),
      setupComplete: v.optional(v.boolean()),
    }).index("by_userId", ["userId"]),

    // Trusted people to contact during an emergency (max 10 per user).
    emergencyContacts: defineTable({
      userId: v.id("users"),
      name: v.string(),
      relationship: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      priority: v.number(),
      isPrimary: v.boolean(),
      image: v.optional(v.string()),
    }).index("by_userId", ["userId"]),

    // One row per emergency event.
    alerts: defineTable({
      userId: v.id("users"),
      type: alertTypeValidator,
      status: alertStatusValidator,
      message: v.optional(v.string()),
      triggeredAt: v.number(),
      cancelledAt: v.optional(v.number()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      accuracy: v.optional(v.number()),
      locationLabel: v.optional(v.string()),
      locationShared: v.boolean(),
      recipientsCount: v.number(),
      channel: v.optional(v.string()), // "demo" | "sms" | "email" | "push"
      note: v.optional(v.string()),
    })
      .index("by_userId", ["userId"])
      .index("by_status", ["status"]),

    // Per-contact delivery record for an alert.
    alertRecipients: defineTable({
      alertId: v.id("alerts"),
      contactId: v.optional(v.id("emergencyContacts")),
      contactName: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      status: recipientStatusValidator,
      sentAt: v.number(),
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
    })
      .index("by_userId", ["userId"]),

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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
