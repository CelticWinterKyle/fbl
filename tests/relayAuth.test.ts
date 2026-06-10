import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  signRelayToken,
  verifyRelayToken,
  TOKEN_TTL_S,
} from "@/lib/relayAuth";

const SECRET = "test-session-secret-0123456789abcdef0123456789abcdef";
const USER_ID = "user_2abcDEF";

beforeAll(() => {
  // verifyRelayToken reads the secret from env; sign with the same one.
  process.env.SESSION_SECRET = SECRET;
  // No KV in tests: token version defaults to 1, so sign/verify work offline.
  delete process.env.KV_REST_API_URL;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("relay token sign/verify", () => {
  it("round-trips a freshly signed token", async () => {
    const token = await signRelayToken(USER_ID, SECRET);
    const result = await verifyRelayToken(token);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(USER_ID);
    expect(result!.ageS).toBeGreaterThanOrEqual(0);
    expect(result!.ageS).toBeLessThan(5);
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
    const token = await signRelayToken(USER_ID, SECRET);

    // Just past the TTL: must be rejected.
    vi.setSystemTime(new Date(Date.parse("2026-06-09T12:00:00Z") + (TOKEN_TTL_S + 5) * 1000));
    expect(await verifyRelayToken(token)).toBeNull();
  });

  it("rejects a token from the future beyond clock skew", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T12:00:00Z"));
    const token = await signRelayToken(USER_ID, SECRET);

    // Verifier clock 5 minutes BEHIND the signer: token appears future-dated.
    vi.setSystemTime(new Date("2026-06-09T11:55:00Z"));
    expect(await verifyRelayToken(token)).toBeNull();
  });

  it("rejects a tampered userId", async () => {
    const token = await signRelayToken(USER_ID, SECRET);
    const tampered = token.replace(USER_ID, "user_evil999");
    expect(await verifyRelayToken(tampered)).toBeNull();
  });

  it("rejects a tampered timestamp", async () => {
    const token = await signRelayToken(USER_ID, SECRET);
    const [userId, ver, ts, hmac] = token.split(":");
    const tampered = `${userId}:${ver}:${Number(ts) + 60}:${hmac}`;
    expect(await verifyRelayToken(tampered)).toBeNull();
  });

  it("rejects a tampered hmac", async () => {
    const token = await signRelayToken(USER_ID, SECRET);
    const flipped = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(await verifyRelayToken(flipped)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signRelayToken(USER_ID, "some-other-secret-that-is-long-enough");
    expect(await verifyRelayToken(token)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyRelayToken(null)).toBeNull();
    expect(await verifyRelayToken("")).toBeNull();
    expect(await verifyRelayToken("not-a-token")).toBeNull();
    expect(await verifyRelayToken("a:b:c")).toBeNull();
    expect(await verifyRelayToken("a:b:c:d:e")).toBeNull();
    expect(await verifyRelayToken(`${USER_ID}:x:y:zz`)).toBeNull();
  });
});
