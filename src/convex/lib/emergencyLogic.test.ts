import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessEmergencySession,
  canAccessEmergencyVideo,
  estimateEtaMinutes,
  formatDistanceMeters,
  haversineMeters,
  helperCanSeeLocation,
  isWithinRadius,
  ownerFirstName,
} from "./emergencyLogic";

describe("haversineMeters", () => {
  it("returns 0 for identical coordinates", () => {
    assert.equal(haversineMeters(51.5074, -0.1278, 51.5074, -0.1278), 0);
  });

  it("computes ~111.2 km for one degree of latitude", () => {
    const d = haversineMeters(0, 0, 1, 0);
    assert.ok(Math.abs(d - 111_195) < 100, `got ${d}`);
  });

  it("is symmetric", () => {
    const a = haversineMeters(40.7128, -74.006, 48.8566, 2.3522);
    const b = haversineMeters(48.8566, 2.3522, 40.7128, -74.006);
    assert.ok(Math.abs(a - b) < 1e-6);
  });
});

describe("isWithinRadius (default 5 km radius)", () => {
  // ~0.040° of latitude ≈ 4.45 km; ~0.060° ≈ 6.67 km.
  it("includes helpers inside the radius", () => {
    assert.equal(isWithinRadius(52.0, 13.0, 52.04, 13.0, 5_000), true);
    assert.equal(isWithinRadius(52.0, 13.0, 52.0, 13.0, 5_000), true);
  });

  it("excludes helpers outside the radius", () => {
    assert.equal(isWithinRadius(52.0, 13.0, 52.06, 13.0, 5_000), false);
  });

  it("is exact at the boundary", () => {
    assert.equal(isWithinRadius(52.0, 13.0, 52.0, 13.0, 0), true);
    assert.equal(isWithinRadius(52.0, 13.0, 52.04, 13.0, 0), false);
  });
});

describe("canAccessEmergencySession", () => {
  const base = {
    isOwner: false,
    isVerifiedContact: false,
    isHelperNearby: false,
  };

  it("owner → full access", () => {
    assert.equal(
      canAccessEmergencySession({ ...base, isOwner: true }),
      "owner",
    );
  });

  it("verified contact → full access", () => {
    assert.equal(
      canAccessEmergencySession({ ...base, isVerifiedContact: true }),
      "verified_contact",
    );
  });

  it("nearby helper → helper_nearby (location only)", () => {
    assert.equal(
      canAccessEmergencySession({ ...base, isHelperNearby: true }),
      "helper_nearby",
    );
  });

  it("admin → limited access", () => {
    assert.equal(canAccessEmergencySession({ ...base, role: "admin" }), "admin");
  });

  it("stranger → no access", () => {
    assert.equal(canAccessEmergencySession(base), null);
    assert.equal(canAccessEmergencySession({ ...base, role: "user" }), null);
  });
});

describe("canAccessEmergencyVideo (LiveKit restricted)", () => {
  it("allows owner and verified contacts", () => {
    assert.equal(canAccessEmergencyVideo("owner"), true);
    assert.equal(canAccessEmergencyVideo("verified_contact"), true);
  });

  it("rejects nearby helpers and everyone else", () => {
    assert.equal(canAccessEmergencyVideo("helper_nearby"), false);
    assert.equal(canAccessEmergencyVideo("admin"), false);
    assert.equal(canAccessEmergencyVideo(null), false);
  });
});

describe("helperCanSeeLocation (access revoked on end)", () => {
  it("allows while the emergency is open", () => {
    assert.equal(helperCanSeeLocation("active"), true);
    assert.equal(helperCanSeeLocation("responding"), true);
  });

  it("revokes when the emergency ends", () => {
    assert.equal(helperCanSeeLocation("resolved"), false);
    assert.equal(helperCanSeeLocation("cancelled"), false);
    assert.equal(helperCanSeeLocation("expired"), false);
  });
});

describe("ownerFirstName", () => {
  it("returns only the first name", () => {
    assert.equal(ownerFirstName("Alex Morgan"), "Alex");
    assert.equal(ownerFirstName("  Jamie  Lee  "), "Jamie");
  });

  it("falls back for missing names", () => {
    assert.equal(ownerFirstName(undefined), "An EAlert user");
    assert.equal(ownerFirstName(""), "An EAlert user");
    assert.equal(ownerFirstName("   "), "An EAlert user");
  });
});

describe("estimateEtaMinutes", () => {
  it("estimates ~10 minutes for 5 km at 30 km/h", () => {
    assert.equal(estimateEtaMinutes(5_000), 10);
  });

  it("never returns 0 for a positive distance", () => {
    assert.equal(estimateEtaMinutes(1), 1);
    assert.equal(estimateEtaMinutes(0), 0);
  });
});

describe("formatDistanceMeters", () => {
  it("formats meters and kilometers", () => {
    assert.equal(formatDistanceMeters(850), "850 m");
    assert.equal(formatDistanceMeters(1200), "1.2 km");
    assert.equal(formatDistanceMeters(5000), "5.0 km");
  });
});
