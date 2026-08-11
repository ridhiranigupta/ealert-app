/**
 * LiveKit emergency video provider — configuration + access-token minting.
 *
 * Pure module (no Convex imports) so it can be unit-tested directly.
 *
 * Security rules:
 *   - Secrets (LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are only ever read from
 *     `process.env` here, inside the Convex backend. They are never shipped
 *     to the browser, stored in localStorage, or accepted as client args.
 *   - Tokens are short-lived HS256 JWTs signed with the API secret, scoped to
 *     exactly one room, and carry an explicit video grant.
 *   - "configured" means ALL of LIVEKIT_URL, LIVEKIT_API_KEY and
 *     LIVEKIT_API_SECRET are present. If any is missing the app reports
 *     unconfigured instead of pretending video works.
 */

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/** Read the LiveKit credentials from the environment (server-side only). */
export function liveKitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export interface VideoProviderStatus {
  configured: boolean;
  provider?: "livekit";
  /** LiveKit WebSocket URL — safe to send to the client (not a secret). */
  url?: string;
}

/** Truthful provider status: configured ⟺ every LiveKit variable is set. */
export function videoProviderStatus(): VideoProviderStatus {
  const config = liveKitConfig();
  if (!config) return { configured: false };
  return { configured: true, provider: "livekit", url: config.url };
}

/* ------------------------------------------------------------------ */
/* JWT helpers (Web Crypto — runs in any Convex runtime)               */
/* ------------------------------------------------------------------ */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Mint a LiveKit access token (HS256 JWT, Web Crypto).
 *
 * Claim layout follows the LiveKit access-token spec:
 *   header: { alg: "HS256", typ: "JWT", kid: <api key> }
 *   payload: { iss: <api key>, sub: <identity>, name, exp, nbf,
 *              video: { room, roomJoin, canPublish, canSubscribe,
 *                       canPublishData } }
 */
export async function livekitToken(opts: {
  apiKey: string;
  apiSecret: string;
  room: string;
  identity: string;
  name?: string;
  canPublish: boolean;
  ttlSeconds: number;
}): Promise<string> {
  const enc = new TextEncoder();
  const header = bytesToBase64Url(
    enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT", kid: opts.apiKey })),
  );
  const now = Math.floor(Date.now() / 1000);
  const claims = bytesToBase64Url(
    enc.encode(
      JSON.stringify({
        iss: opts.apiKey,
        sub: opts.identity,
        name: opts.name,
        exp: now + opts.ttlSeconds,
        nbf: now - 30,
        video: {
          room: opts.room,
          roomJoin: true,
          canPublish: opts.canPublish,
          canSubscribe: true,
          canPublishData: true,
        },
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(opts.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${bytesToBase64Url(sig)}`;
}
