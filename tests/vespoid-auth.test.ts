import { describe, expect, test } from "bun:test";
import { accessAssertionFromHeaders } from "../src/lib/cloudflare-access";
import {
  assertVespoidIdentity,
  isVespoidIdentityAuthorized,
  VESPOID_OWNER_EMAIL,
  type VespoidIdentity,
} from "../src/lib/vespoid-auth";

function identity(overrides: Partial<VespoidIdentity> = {}): VespoidIdentity {
  return {
    tokenIdentifier: "issuer|subject",
    subject: "subject",
    issuer: "https://misty-credit-c592.cloudflareaccess.com",
    ...overrides,
  };
}

describe("Vespoid authorization", () => {
  test("allows only the configured owner email for browser identities", () => {
    expect(isVespoidIdentityAuthorized(identity({ email: VESPOID_OWNER_EMAIL }))).toBe(true);
    expect(isVespoidIdentityAuthorized(identity({ email: VESPOID_OWNER_EMAIL.toUpperCase() }))).toBe(true);
  });

  test("rejects unauthenticated direct calls", () => {
    expect(isVespoidIdentityAuthorized(null)).toBe(false);
    expect(() => assertVespoidIdentity(null)).toThrow("Unauthorized");
  });

  test("rejects a signed identity for the wrong user", () => {
    const attacker = identity({ email: "attacker@example.com" });
    expect(isVespoidIdentityAuthorized(attacker)).toBe(false);
    expect(() => assertVespoidIdentity(attacker)).toThrow("Unauthorized");
  });

  test("allows only the configured Cloudflare Access service-token client ID for ingestion", () => {
    const machineClientId = "machine-client-id.access";
    const machine = identity({ common_name: machineClientId });
    expect(isVespoidIdentityAuthorized(machine, { ingestionServiceClientId: machineClientId })).toBe(true);
    expect(isVespoidIdentityAuthorized(machine)).toBe(false);
    expect(isVespoidIdentityAuthorized(identity({ common_name: "other-service.access" }), { ingestionServiceClientId: machineClientId })).toBe(false);
  });
});

describe("Cloudflare Access assertion extraction", () => {
  test("uses only Cloudflare's verified assertion header", () => {
    expect(accessAssertionFromHeaders(new Headers({ "cf-access-jwt-assertion": "signed.jwt" }))).toBe("signed.jwt");
    expect(accessAssertionFromHeaders(new Headers({ authorization: "Bearer attacker-controlled" }))).toBeNull();
  });
});
