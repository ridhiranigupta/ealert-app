import { internalMutation } from "./_generated/server";
import { canonicalPhone } from "./lib/alertLogic";

/**
 * One-time data repair for app-to-app contact matching.
 *
 * `users.phone` was historically stored raw ("+1 555 000 1234") and was
 * never written at all by onboarding (which only writes `profiles`).
 * `findRegisteredUser` matches on canonical digits, so this:
 *   1. rewrites existing `users.phone` values to the canonical form, and
 *   2. backfills `users.phone` from the safety profile for accounts that
 *      never saved a phone on the account row.
 *
 * Idempotent — safe to run more than once. Internal only: never exposed
 * to the client API.
 *
 *   bunx convex run internal/backfill:normalizeUserPhones
 */
export const normalizeUserPhones = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let normalized = 0;
    let backfilled = 0;

    for (const user of users) {
      if (user.phone) {
        const canonical = canonicalPhone(user.phone);
        if (canonical && canonical !== user.phone) {
          await ctx.db.patch(user._id, { phone: canonical });
          normalized++;
        }
      } else {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .first();
        if (profile?.phone) {
          const canonical = canonicalPhone(profile.phone);
          if (canonical) {
            await ctx.db.patch(user._id, { phone: canonical });
            backfilled++;
          }
        }
      }
    }

    return { users: users.length, normalized, backfilled };
  },
});
