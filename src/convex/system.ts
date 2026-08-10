import { query } from "./_generated/server";
import { providerStatus } from "./services/notify";

/**
 * Public health check (safe): reports uptime and which external providers
 * are configured — as booleans only, never secrets or credentials.
 */
export const health = query({
  args: {},
  handler: async () => {
    return {
      ok: true,
      service: "ealert-convex",
      time: Date.now(),
      providers: providerStatus(),
    };
  },
});
