import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmergencyMessages,
  canonicalPhone,
  computeAlertStatus,
  effectiveChannels,
  isDuplicatePhone,
  makeClientAlertId,
  normalizePhone,
  validateClientAlertId,
  validatePhone,
} from "./alertLogic";

describe("buildEmergencyMessages", () => {
  const ts = Date.UTC(2026, 0, 15, 14, 30, 0); // 2026-01-15 14:30:00 UTC

  it("builds an SMS variant with the user name and location", () => {
    const { sms } = buildEmergencyMessages({
      userName: "Alex Morgan",
      locationLabel: "12.34567, -98.76543",
      timestamp: ts,
    });
    assert.match(sms, /EMERGENCY ALERT from Alex Morgan\./);
    assert.match(sms, /I may need immediate assistance\./);
    assert.match(sms, /Location: 12\.34567, -98\.76543/);
  });

  it("includes timestamp and closing line in the email variant", () => {
    const { email } = buildEmergencyMessages({
      userName: "Alex Morgan",
      locationLabel: "12.34567, -98.76543",
      timestamp: ts,
    });
    assert.match(email, /Time: 2026-01-15 14:30:00 UTC/);
    assert.match(email, /Please contact me or local emergency services if appropriate\./);
  });

  it("does NOT leak private profile fields into any variant", () => {
    const variants = buildEmergencyMessages({
      userName: "Alex Morgan",
      locationLabel: "12.34567, -98.76543",
      note: "Please check on me",
      timestamp: ts,
    });
    for (const body of Object.values(variants)) {
      assert.ok(!/blood/i.test(body), "must not include blood group");
      assert.ok(!/address/i.test(body), "must not include address");
      assert.ok(!/father|mother/i.test(body), "must not include family names");
      assert.ok(!/medical|dob|phone\s*[:=]/.test(body), "must not include medical/dob/phone");
    }
  });

  it("includes an optional note in email and push, but keeps SMS compact", () => {
    const { sms, email, push } = buildEmergencyMessages({
      userName: "Alex Morgan",
      locationLabel: "12.34567, -98.76543",
      note: "Meet me at the station",
      timestamp: ts,
    });
    assert.ok(!sms.includes("Note:"), "SMS stays compact");
    assert.match(email, /Note: Meet me at the station/);
    assert.match(push, /Meet me at the station/);
  });

  it("falls back to 'Unknown location' when no location is provided", () => {
    const { sms } = buildEmergencyMessages({ userName: "Alex Morgan", timestamp: ts });
    assert.match(sms, /Location: Unknown location/);
  });

  it("prefers the map link when provided", () => {
    const { sms } = buildEmergencyMessages({
      userName: "Alex Morgan",
      mapLink: "https://maps.example.com/place/12.34,-98.76",
      timestamp: ts,
    });
    assert.match(sms, /Location: https:\/\/maps\.example\.com/);
  });
});

describe("phone validation", () => {
  it("accepts international and domestic formats", () => {
    assert.equal(validatePhone("+1 555 000 1234").ok, true);
    assert.equal(validatePhone("+15550001234").ok, true);
    assert.equal(validatePhone("555-000-1234").ok, true);
    assert.equal(validatePhone("(555) 000-1234").ok, true);
  });

  it("normalizes separators and country prefixes", () => {
    assert.equal(normalizePhone("+1 (555) 000-1234"), "+15550001234");
    assert.equal(normalizePhone("555-000-1234"), "5550001234");
  });

  it("canonicalizes to bare digits regardless of the '+' convention", () => {
    assert.equal(canonicalPhone("+1 (555) 000-1234"), "15550001234");
    assert.equal(canonicalPhone("+15550001234"), "15550001234");
    assert.equal(canonicalPhone("15550001234"), "15550001234");
    assert.equal(canonicalPhone("555-000-1234"), "5550001234");
    assert.equal(canonicalPhone(""), "");
  });

  it("rejects empty, too-short, and too-long numbers", () => {
    assert.equal(validatePhone("").ok, false);
    assert.equal(validatePhone("   ").ok, false);
    assert.equal(validatePhone("12345").ok, false); // 5 digits
    assert.equal(validatePhone("1234567890123456").ok, false); // 16 digits
    const reason = validatePhone("").reason;
    assert.ok(reason && reason.length > 0, "has a reason");
  });
});

describe("idempotency keys", () => {
  it("accepts well-formed client alert ids", () => {
    assert.equal(validateClientAlertId("sos-12345678-1234-1234-1234-123456789012"), true);
    assert.equal(validateClientAlertId("sos_abc123ABC-123"), true);
  });

  it("rejects empty, short, or malformed ids", () => {
    assert.equal(validateClientAlertId(undefined), false);
    assert.equal(validateClientAlertId(""), false);
    assert.equal(validateClientAlertId("sos"), false); // too short
    assert.equal(validateClientAlertId("sos-<script>"), false); // unsafe chars
  });

  it("generates unique keys", () => {
    const a = makeClientAlertId();
    const b = makeClientAlertId();
    assert.notEqual(a, b);
    assert.equal(validateClientAlertId(a), true);
  });
});

describe("computeAlertStatus", () => {
  it("returns queued for an alert with no recipients yet", () => {
    assert.equal(computeAlertStatus([]), "queued");
  });

  it("returns delivered only when every recipient is confirmed delivered", () => {
    assert.equal(computeAlertStatus(["delivered", "delivered"]), "delivered");
  });

  it("returns failed when every recipient failed", () => {
    assert.equal(computeAlertStatus(["failed", "failed"]), "failed");
  });

  it("returns partially_delivered when some succeed and some fail", () => {
    assert.equal(computeAlertStatus(["delivered", "failed"]), "partially_delivered");
    assert.equal(computeAlertStatus(["delivered", "delivered", "failed"]), "partially_delivered");
  });

  it("returns sending while any recipient is in flight", () => {
    assert.equal(computeAlertStatus(["sent", "queued"]), "sending");
    assert.equal(computeAlertStatus(["retrying"]), "sending");
  });

  it("treats delivered + pending as partially_delivered", () => {
    assert.equal(computeAlertStatus(["delivered", "queued"]), "partially_delivered");
  });

  it("never upgrades a partially failed alert to delivered", () => {
    const status = computeAlertStatus(["delivered", "failed", "sending"]);
    assert.notEqual(status, "delivered");
  });
});

describe("contact dedupe", () => {
  const existing = [{ phone: "+1 555 000 1234" }, { phone: "+44 20 7946 0958" }];

  it("detects duplicates regardless of formatting", () => {
    assert.equal(isDuplicatePhone(existing, "+1 555 000 1234"), true);
    assert.equal(isDuplicatePhone(existing, "+15550001234"), true);
    assert.equal(isDuplicatePhone(existing, "15550001234"), true); // "+" can't bypass the check
    assert.equal(isDuplicatePhone(existing, "2079460958"), false); // different number
  });

  it("returns false for empty phone", () => {
    assert.equal(isDuplicatePhone(existing, ""), false);
  });
});

describe("effectiveChannels", () => {
  it("uses explicit channel preferences", () => {
    assert.deepEqual(effectiveChannels({ channels: ["sms", "email", "sms"] }), ["sms", "email"]);
  });

  it("defaults to sms + email when an email exists", () => {
    assert.deepEqual(effectiveChannels({ email: "x@y.z" }), ["sms", "email"]);
  });

  it("defaults to sms only without an email", () => {
    assert.deepEqual(effectiveChannels({}), ["sms"]);
  });
});
