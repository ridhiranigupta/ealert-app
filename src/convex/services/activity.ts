import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type Action =
  | "login"
  | "logout"
  | "register"
  | "profile_update"
  | "password_change"
  | "contact_added"
  | "contact_updated"
  | "contact_removed"
  | "contact_primary"
  | "sos_activated"
  | "sos_cancelled"
  | "location_shared"
  | "location_started"
  | "location_stopped"
  | "test_notification"
  | "device_registered"
  | "notification_read"
  | "account_disabled"
  | "account_enabled"
  | "account_deleted"
  | "role_changed"
  | "profile_completed"
  | "alert_viewed"
  | "settings_updated"
  | "contact_invite_sent"
  | "contact_invite_accepted"
  | "contact_invite_declined"
  | "emergency_session_created"
  | "emergency_session_ended"
  | "emergency_responding"
  | "emergency_opened"
  | "emergency_location_updated"
  | "video_started"
  | "video_ended"
  | "nearby_helpers_notified"
  | "nearby_helper_responding"
  | "phone_otp_sent"
  | "phone_verified"
  | "email_verification_sent"
  | "email_verified";

export type Result = "success" | "failed" | "cancelled" | "blocked";

/** Append an audit row. `metadata` may be a small JSON string. */
export async function logActivity(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    action: Action;
    result?: Result;
    metadata?: string;
    device?: string;
  },
) {
  await ctx.db.insert("activityLogs", {
    userId: args.userId,
    action: args.action,
    result: args.result ?? "success",
    metadata: args.metadata,
    device: args.device,
    createdAt: Date.now(),
  });
}
