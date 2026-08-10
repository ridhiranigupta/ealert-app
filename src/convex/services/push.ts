/**
 * App-to-app push delivery for EAlert.
 *
 * Two real adapters, both driven by server-side environment variables:
 *
 *   FCM (Android / iOS / FCM web tokens)
 *     FCM_SERVICE_ACCOUNT — JSON string of the Firebase service-account key
 *     (project_id, client_email, private_key). Implements the HTTP v1 API:
 *     RS256 JWT → OAuth token → messages:send with high-priority payload.
 *
 *   Web Push (browser subscriptions, RFC 8291)
 *     VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ VAPID_SUBJECT)
 *     Full VAPID (ES256) auth header + aes128gcm payload encryption.
 *
 * When no provider is configured, delivery reports `provider_not_configured`
 * and recipients stay `pending` — nothing is ever claimed as sent/delivered
 * without a real provider acknowledgement.
 *
 * All cryptography uses the Web Crypto API (`crypto.subtle`) — no Node-only
 * dependencies, so this runs in any Convex runtime.
 */

/* ------------------------------------------------------------------ */
/* Base64 helpers                                                      */
/* ------------------------------------------------------------------ */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Convert a Uint8Array into a standalone BufferSource for Web Crypto. */
function toBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.slice().buffer as ArrayBuffer;
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  return base64UrlToBytes(body);
}

/* ------------------------------------------------------------------ */
/* JWT helpers                                                         */
/* ------------------------------------------------------------------ */

interface JwtSigner {
  header: Record<string, string>;
  sign: (data: Uint8Array) => Promise<Uint8Array>;
}

async function signJwt(signer: JwtSigner, claims: Record<string, string | number>): Promise<string> {
  const headerB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(signer.header)));
  const claimsB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const sig = await signer.sign(new TextEncoder().encode(`${headerB64}.${claimsB64}`));
  return `${headerB64}.${claimsB64}.${bytesToBase64Url(sig)}`;
}

/** Convert a raw (r||s) ECDSA signature into DER for JWT ES256. */
function rawEcdsaToDer(signature: Uint8Array): Uint8Array {
  const half = signature.length / 2;
  const r = signature.slice(0, half);
  const s = signature.slice(half);
  const derInt = (int: Uint8Array): Uint8Array => {
    let bytes = int;
    // Strip leading zeroes.
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    bytes = bytes.slice(start);
    if (bytes[0] & 0x80) {
      const padded = new Uint8Array(bytes.length + 1);
      padded[0] = 0;
      padded.set(bytes, 1);
      bytes = padded;
    }
    return new Uint8Array([0x02, bytes.length, ...bytes]);
  };
  const rEnc = derInt(r);
  const sEnc = derInt(s);
  return new Uint8Array([0x30, rEnc.length + sEnc.length, ...rEnc, ...sEnc]);
}

/* ------------------------------------------------------------------ */
/* Provider configuration                                              */
/* ------------------------------------------------------------------ */

export interface PushProviderStatus {
  configured: boolean;
  fcm: { configured: boolean };
  webPush: { configured: boolean };
  provider?: string;
  /** Public VAPID key — safe to expose for browser subscriptions. */
  vapidPublicKey?: string;
}

export function pushProviderStatus(): PushProviderStatus {
  const fcmConfigured = Boolean(process.env.FCM_SERVICE_ACCOUNT);
  const webPushConfigured = Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
  return {
    configured: fcmConfigured || webPushConfigured,
    fcm: { configured: fcmConfigured },
    webPush: { configured: webPushConfigured },
    provider: fcmConfigured ? "fcm" : webPushConfigured ? "webpush" : undefined,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  };
}

/* ------------------------------------------------------------------ */
/* FCM HTTP v1 (Android / iOS / FCM web)                               */
/* ------------------------------------------------------------------ */

interface FcmServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

async function fcmAccessToken(account: FcmServiceAccount): Promise<string> {
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error("fcm_service_account_incomplete");
  }
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(account.private_key).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      header: { alg: "RS256", typ: "JWT" },
      sign: async (data) =>
        new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, toBufferSource(data))),
    },
    {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`fcm_token_http_${res.status}: ${text}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("fcm_token_missing");
  return data.access_token;
}

export interface PushSendResult {
  ok: boolean;
  sent: number;
  failed: number;
  /** Per-token errors, classified: "unregistered_token" → revoke device. */
  errors: { token: string; error: string; unregistered: boolean }[];
}

/** Send high-priority notifications through FCM HTTP v1. */
export async function sendFcmPush(opts: {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<PushSendResult> {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) {
    return {
      ok: false,
      sent: 0,
      failed: opts.tokens.length,
      errors: opts.tokens.map((t) => ({ token: t, error: "provider_not_configured", unregistered: false })),
    };
  }
  let account: FcmServiceAccount;
  try {
    account = JSON.parse(raw) as FcmServiceAccount;
  } catch {
    return {
      ok: false,
      sent: 0,
      failed: opts.tokens.length,
      errors: opts.tokens.map((t) => ({ token: t, error: "fcm_service_account_invalid_json", unregistered: false })),
    };
  }

  try {
    const accessToken = await fcmAccessToken(account);
    const project = account.project_id ?? "unknown";
    const errors: PushSendResult["errors"] = [];
    let sent = 0;

    for (const token of opts.tokens) {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: opts.title, body: opts.body },
                data: opts.data,
                android: {
                  priority: "high",
                  notification: { channelId: "emergency", priority: "high" },
                },
                apns: {
                  headers: { "apns-priority": "10", "apns-push-type": "alert" },
                  payload: { aps: { sound: "default", "content-available": 1 } },
                },
                webpush: { headers: { Urgency: "high", TTL: "86400" } },
              },
            }),
          },
        );
        if (res.ok) {
          sent++;
        } else if (res.status === 404 || res.status === 410) {
          errors.push({ token, error: "unregistered_token", unregistered: true });
        } else {
          const text = (await res.text()).slice(0, 200);
          errors.push({ token, error: `fcm_http_${res.status}: ${text}`, unregistered: false });
        }
      } catch (err) {
        errors.push({
          token,
          error: err instanceof Error ? err.message : "fcm_network_error",
          unregistered: false,
        });
      }
    }

    return { ok: sent > 0, sent, failed: opts.tokens.length - sent, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : "fcm_error";
    return {
      ok: false,
      sent: 0,
      failed: opts.tokens.length,
      errors: opts.tokens.map((t) => ({ token: t, error: message, unregistered: false })),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Web Push (VAPID + RFC 8291)                                         */
/* ------------------------------------------------------------------ */

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function vapidJwt(): Promise<string> {
  const publicB64 = process.env.VAPID_PUBLIC_KEY;
  const privateB64 = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:alerts@ealert.app";
  if (!publicB64 || !privateB64) throw new Error("provider_not_configured");

  const pub = base64UrlToBytes(publicB64);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("vapid_public_key_invalid");
  const x = bytesToBase64Url(pub.slice(1, 33));
  const y = bytesToBase64Url(pub.slice(33, 65));

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, d: privateB64 },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch {
    // Fallback: private key supplied as PKCS8 DER (base64url or PEM).
    const der = privateB64.includes("-----")
      ? pemToBytes(privateB64)
      : base64UrlToBytes(privateB64);
    key = await crypto.subtle.importKey(
      "pkcs8",
      der.buffer as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      header: { alg: "ES256", typ: "JWT" },
      sign: async (data) =>
        rawEcdsaToDer(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, toBufferSource(data)))),
    },
    { aud: "https://fcm.googleapis.com", exp: now + 12 * 3600, sub: subject },
  );
  return jwt;
}

async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toBufferSource(prk), "HMAC", false, ["sign"]);
  const block = new Uint8Array(await crypto.subtle.sign("HMAC", key, toBufferSource(info)));
  return block.slice(0, length);
}

/** Encrypt a payload per RFC 8291 (aes128gcm) using Web Crypto. */
async function encryptWebPushPayload(
  payload: Uint8Array,
  subscription: WebPushSubscription,
): Promise<{ ciphertext: Uint8Array; serverPublic: Uint8Array }> {
  const clientPublic = base64UrlToBytes(subscription.keys.p256dh);
  const authSecret = base64UrlToBytes(subscription.keys.auth);
  if (authSecret.length !== 16) throw new Error("webpush_auth_secret_invalid");

  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublic.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256),
  );
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));

  // HKDF: IKM = shared secret, salt = auth secret.
  const prk = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: authSecret.buffer as ArrayBuffer,
        info: new Uint8Array(0),
      },
      await crypto.subtle.importKey("raw", shared.buffer as ArrayBuffer, "HKDF", false, ["deriveBits"]),
      256,
    ),
  );

  const keyInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info"),
    0,
    ...clientPublic,
    ...serverPublic,
  ]);
  const nonceInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info"),
    1,
    ...clientPublic,
    ...serverPublic,
  ]);
  const cekInfo = new Uint8Array([...new TextEncoder().encode("Content-Encoding: aes128gcm"), 0]);

  const contentKey = await hkdfExpand(prk, keyInfo, 16);
  const nonce = await hkdfExpand(prk, nonceInfo, 12);
  const cek = await hkdfExpand(prk, cekInfo, 16);

  const aesKey = await crypto.subtle.importKey("raw", toBufferSource(cek), { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBufferSource(nonce), tagLength: 128 },
      aesKey,
      toBufferSource(payload),
    ),
  );

  // aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || serverPublic(65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(authSecret, 0);
  const dv = new DataView(header.buffer);
  dv.setUint32(16, rs, false);
  header[20] = 65;
  header.set(serverPublic, 21);

  const ciphertext = new Uint8Array(header.length + encrypted.length);
  ciphertext.set(header, 0);
  ciphertext.set(encrypted, header.length);
  return { ciphertext, serverPublic };
}

/** Send a Web Push notification to browser subscriptions. */
export async function sendWebPush(opts: {
  subscriptions: WebPushSubscription[];
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<PushSendResult> {
  if (opts.subscriptions.length === 0) {
    return { ok: false, sent: 0, failed: 0, errors: [] };
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return {
      ok: false,
      sent: 0,
      failed: opts.subscriptions.length,
      errors: opts.subscriptions.map((s) => ({
        token: s.endpoint,
        error: "provider_not_configured",
        unregistered: false,
      })),
    };
  }

  const payload = new TextEncoder().encode(
    JSON.stringify({ ...opts.data, title: opts.title, body: opts.body }),
  );
  const errors: PushSendResult["errors"] = [];
  let sent = 0;

  for (const sub of opts.subscriptions) {
    try {
      const { ciphertext } = await encryptWebPushPayload(payload, sub);
      const jwt = await vapidJwt();
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "Content-Encoding": "aes128gcm",
          "Content-Length": String(ciphertext.length),
          TTL: "86400",
          Urgency: "high",
          Authorization: `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY}`,
        },
        body: ciphertext.buffer as ArrayBuffer,
      });
      if (res.ok || res.status === 201) {
        sent++;
      } else if (res.status === 404 || res.status === 410) {
        errors.push({ token: sub.endpoint, error: "unregistered_token", unregistered: true });
      } else {
        errors.push({ token: sub.endpoint, error: `webpush_http_${res.status}`, unregistered: false });
      }
    } catch (err) {
      errors.push({
        token: sub.endpoint,
        error: err instanceof Error ? err.message : "webpush_error",
        unregistered: false,
      });
    }
  }

  return { ok: sent > 0, sent, failed: opts.subscriptions.length - sent, errors };
}

/* ------------------------------------------------------------------ */
/* Combined emergency dispatch                                         */
/* ------------------------------------------------------------------ */

export interface EmergencyPushDevice {
  /** Recipient EAlert user id. */
  userId: string;
  platform: string;
  token: string;
}

/**
 * Deliver an emergency notification to a set of registered devices.
 * Returns per-device outcomes; the caller maps them back to recipients and
 * records honest per-recipient push status. Never throws — always reports.
 */
export async function dispatchEmergencyPush(opts: {
  devices: EmergencyPushDevice[];
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<{
  ok: boolean;
  provider: string | null;
  results: { device: EmergencyPushDevice; ok: boolean; error?: string; unregistered?: boolean }[];
}> {
  const status = pushProviderStatus();
  if (!status.configured) {
    return {
      ok: false,
      provider: null,
      results: opts.devices.map((device) => ({
        device,
        ok: false,
        error: "provider_not_configured",
      })),
    };
  }

  const fcmTokens = opts.devices
    .filter((d) => d.platform !== "web")
    .map((d) => d.token);
  const webSubs = opts.devices
    .filter((d) => d.platform === "web")
    .map((d) => {
      try {
        return { endpoint: d.token, subscription: JSON.parse(d.token) as WebPushSubscription };
      } catch {
        return null;
      }
    })
    .filter((x): x is { endpoint: string; subscription: WebPushSubscription } => x !== null);

  const results: { device: EmergencyPushDevice; ok: boolean; error?: string; unregistered?: boolean }[] = [];

  if (fcmTokens.length > 0 && status.fcm.configured) {
    const fcm = await sendFcmPush({ tokens: fcmTokens, title: opts.title, body: opts.body, data: opts.data });
    const byToken = new Map<string, PushSendResult["errors"][number]>(
      fcm.errors.map((e) => [e.token, e]),
    );
    for (const d of opts.devices.filter((x) => x.platform !== "web")) {
      const err = byToken.get(d.token);
      results.push({
        device: d,
        ok: !err,
        error: err?.error,
        unregistered: err?.unregistered,
      });
    }
  } else {
    for (const d of opts.devices.filter((x) => x.platform !== "web")) {
      results.push({
        device: d,
        ok: false,
        error: status.fcm.configured ? undefined : "provider_not_configured",
      });
    }
  }

  if (webSubs.length > 0 && status.webPush.configured) {
    const web = await sendWebPush({
      subscriptions: webSubs.map((w) => w.subscription),
      title: opts.title,
      body: opts.body,
      data: opts.data,
    });
    const byEndpoint = new Map<string, PushSendResult["errors"][number]>(
      web.errors.map((e) => [e.token, e]),
    );
    for (const d of opts.devices.filter((x) => x.platform === "web")) {
      const err = byEndpoint.get(d.token);
      results.push({
        device: d,
        ok: !err,
        error: err?.error,
        unregistered: err?.unregistered,
      });
    }
  } else {
    for (const d of opts.devices.filter((x) => x.platform === "web")) {
      results.push({
        device: d,
        ok: false,
        error: status.webPush.configured ? undefined : "provider_not_configured",
      });
    }
  }

  return {
    ok: results.some((r) => r.ok),
    provider: status.provider ?? null,
    results,
  };
}
