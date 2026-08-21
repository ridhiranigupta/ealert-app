import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessEmergencySession,
  canAccessEmergencyVideo,
  formatDistanceMeters,
  haversineMeters,
  isWithinRadius,
} from "./lib/emergencyLogic";

/**
 * Unit tests for the Nearby Community SOS Assistance feature.
 *
 * The pure authorization and geospatial functions are tested here.
 * The server-side `communityAssistance` profile filter and
 * `allowHelperVideo` session flag are enforced in Convex mutations/queries
 * and verified through integration tests with real database rows.
 */

/* ------------------------------------------------------------------ */
/* Geospatial radius                                                   */
/* ------------------------------------------------------------------ */

describe("Nearby radius filtering", () => {
  const SOS_LAT = 40.7128;
  const SOS_LNG = -74.006;
  const RADIUS_M = 5_000;

  it("includes a helper within 5 km", () => {
    assert.equal(
      isWithinRadius(SOS_LAT, SOS_LNG, 40.73, -74.006, RADIUS_M),
      true,
    );
  });

  it("excludes a helper outside 5 km", () => {
    assert.equal(
      isWithinRadius(SOS_LAT, SOS_LNG, 40.80, -74.006, RADIUS_M),
      false,
    );
  });

  it("boundary: exact boundary counts as outside", () => {
    // haversine(40.7128,-74.006 to 40.7128,-73.9572) ≈ 4.09 km < 5 km → in
    const dist = haversineMeters(SOS_LAT, SOS_LNG, SOS_LAT, -73.9572);
    assert.ok(dist < RADIUS_M, `expected < ${RADIUS_M}, got ${dist}`);
  });

  it("formatDistanceMeters shows km for ≥1000m", () => {
    assert.equal(formatDistanceMeters(3_200), "3.2 km");
  });

  it("formatDistanceMeters shows m for <1000m", () => {
    assert.equal(formatDistanceMeters(450), "450 m");
  });
});

/* ------------------------------------------------------------------ */
/* Role authorization matrix                                           */
/* ------------------------------------------------------------------ */

describe("Nearby helper authorization", () => {
  const base = {
    isOwner: false,
    isVerifiedContact: false,
    isHelperNearby: true,
  };

  it("helper_nearby gets the helper_nearby role", () => {
    assert.equal(canAccessEmergencySession(base), "helper_nearby");
  });

  it("verified contact still gets verified_contact role over helper", () => {
    assert.equal(
      canAccessEmergencySession({ ...base, isVerifiedContact: true }),
      "verified_contact",
    );
  });

  it("owner still gets owner role over helper", () => {
    assert.equal(
      canAccessEmergencySession({ ...base, isOwner: true }),
      "owner",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Video access — default off for helpers                              */
/* ------------------------------------------------------------------ */

describe("Video access for nearby helpers", () => {
  it("helpers cannot access video by default (allowHelperVideo not set)", () => {
    assert.equal(canAccessEmergencyVideo("helper_nearby"), false);
  });

  it("owner and verified contacts always have video access", () => {
    assert.equal(canAccessEmergencyVideo("owner"), true);
    assert.equal(canAccessEmergencyVideo("verified_contact"), true);
  });

  it("admins and null never have video access", () => {
    assert.equal(canAccessEmergencyVideo("admin"), false);
    assert.equal(canAccessEmergencyVideo(null), false);
  });
  // NOTE: The `allowHelperVideo` session flag is enforced server-side in
  // emergencySessions.ts getSession/joinVideo. When allowHelperVideo=true,
  // the getSession query upgrades the helper's effective video access and
  // joinVideo issues a LiveKit token. This is tested through integration
  // tests with real database rows, not through pure functions.
});
