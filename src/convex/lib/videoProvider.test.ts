import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveKitConfig, livekitToken, videoProviderStatus } from "./videoProvider";

const KEYS = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;

function withEnv(vars: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void) {
  const saved = new Map<(typeof KEYS)[number], string | undefined>();
  for (const key of KEYS) {
    saved.set(key, process.env[key]);
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of KEYS) {
      const prev = saved.get(key);
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }
}

const b64url = (s: string) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b.padEnd(b.length + ((4 - (b.length % 4)) % 4), "="));
};

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

function decodeJwt(token: string): DecodedJwt {
  const parts = token.split(".");
  assert.equal(parts.length, 3, "token has three segments");
  return {
    header: JSON.parse(b64url(parts[0])) as Record<string, unknown>,
    payload: JSON.parse(b64url(parts[1])) as Record<string, unknown>,
    signature: parts[2],
  };
}

async function verifySignature(token: string, secret: string): Promise<boolean> {
  const [header, payload, signature] = token.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`)),
  );
  const expected = btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return expected === signature;
}

describe("videoProviderStatus / liveKitConfig", () => {
  it("reports unconfigured when every variable is missing", () => {
    withEnv({}, () => {
      assert.equal(liveKitConfig(), null);
      assert.deepEqual(videoProviderStatus(), { configured: false });
    });
  });

  it("reports unconfigured when only some variables are set", () => {
    withEnv({ LIVEKIT_URL: "wss://demo.livekit.cloud", LIVEKIT_API_KEY: "APIkey" }, () => {
      assert.equal(liveKitConfig(), null);
      assert.deepEqual(videoProviderStatus(), { configured: false });
    });
  });

  it("reports configured when all three variables are set, exposing only the url", () => {
    withEnv(
      {
        LIVEKIT_URL: "wss://demo.livekit.cloud",
        LIVEKIT_API_KEY: "APIkey",
        LIVEKIT_API_SECRET: "supersecret",
      },
      () => {
        const config = liveKitConfig();
        assert.ok(config, "config present");
        assert.equal(config.url, "wss://demo.livekit.cloud");
        assert.equal(config.apiKey, "APIkey");
        assert.equal(config.apiSecret, "supersecret");
        assert.deepEqual(videoProviderStatus(), {
          configured: true,
          provider: "livekit",
          url: "wss://demo.livekit.cloud",
        });
      },
    );
  });

  it("never leaks the api secret through the provider status", () => {
    withEnv(
      {
        LIVEKIT_URL: "wss://demo.livekit.cloud",
        LIVEKIT_API_KEY: "APIkey",
        LIVEKIT_API_SECRET: "supersecret",
      },
      () => {
        const status = videoProviderStatus();
        assert.ok(!JSON.stringify(status).includes("supersecret"));
      },
    );
  });
});

describe("livekitToken", () => {
  const API_KEY = "APImxiL8rquKztZEoZJV9Fb";
  const API_SECRET = "secret_0123456789abcdef";
  const ROOM = "emergency-jv2c7k1abcdef1234567890";

  it("mints a standard LiveKit access token", async () => {
    const token = await livekitToken({
      apiKey: API_KEY,
      apiSecret: API_SECRET,
      room: ROOM,
      identity: "user_123",
      name: "Alex Morgan",
      canPublish: true,
      ttlSeconds: 3600,
    });
    const { header, payload } = decodeJwt(token);

    assert.equal(header.alg, "HS256");
    assert.equal(header.typ, "JWT");
    assert.equal(header.kid, API_KEY, "header carries the API key id");

    assert.equal(payload.iss, API_KEY);
    assert.equal(payload.sub, "user_123");
    assert.equal(payload.name, "Alex Morgan");

    const video = payload.video as Record<string, unknown>;
    assert.equal(video.room, ROOM);
    assert.equal(video.roomJoin, true);
    assert.equal(video.canPublish, true);
    assert.equal(video.canSubscribe, true);
    assert.equal(video.canPublishData, true);

    const now = Math.floor(Date.now() / 1000);
    const exp = payload.exp as number;
    const nbf = payload.nbf as number;
    assert.ok(exp > now, "token expires in the future");
    assert.ok(nbf <= now, "token is already valid");
    assert.equal(exp - nbf, 3600 + 30, "exp = nbf + ttl + 30s skew");
  });

  it("honors canPublish=false for subscribe-only joins", async () => {
    const token = await livekitToken({
      apiKey: API_KEY,
      apiSecret: API_SECRET,
      room: ROOM,
      identity: "user_456",
      canPublish: false,
      ttlSeconds: 120,
    });
    const { payload } = decodeJwt(token);
    assert.equal((payload.video as Record<string, unknown>).canPublish, false);
  });

  it("signs with the API secret so the server can verify the token", async () => {
    const token = await livekitToken({
      apiKey: API_KEY,
      apiSecret: API_SECRET,
      room: ROOM,
      identity: "user_123",
      canPublish: true,
      ttlSeconds: 3600,
    });
    assert.equal(await verifySignature(token, API_SECRET), true);
    assert.equal(await verifySignature(token, "wrong-secret"), false, "other secret fails");
  });

  it("does not embed the secret in the token", async () => {
    const token = await livekitToken({
      apiKey: API_KEY,
      apiSecret: API_SECRET,
      room: ROOM,
      identity: "user_123",
      canPublish: true,
      ttlSeconds: 3600,
    });
    assert.ok(!token.includes(API_SECRET));
  });

  it("produces unique tokens for different rooms/identities", async () => {
    const a = await livekitToken({ apiKey: API_KEY, apiSecret: API_SECRET, room: "r1", identity: "i1", canPublish: true, ttlSeconds: 3600 });
    const b = await livekitToken({ apiKey: API_KEY, apiSecret: API_SECRET, room: "r1", identity: "i2", canPublish: true, ttlSeconds: 3600 });
    assert.notEqual(a, b);
  });
});
