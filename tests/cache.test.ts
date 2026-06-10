import { beforeAll, describe, expect, it } from "vitest";
import { withCache } from "@/lib/cache";

// These tests exercise the in-memory (dev) mode of withCache, so they must run
// without KV. Real timers and sub-second TTLs are used because the cache reads
// Date.now() and the single-flight path relies on real promise scheduling.

beforeAll(() => {
  delete process.env.KV_REST_API_URL;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withCache (memory mode)", () => {
  it("serves the cached value within TTL without re-invoking the fetcher", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return `value-${calls}`;
    };

    const first = await withCache("test:fresh", 60, fetcher);
    const second = await withCache("test:fresh", 60, fetcher);

    expect(first).toBe("value-1");
    expect(second).toBe("value-1");
    expect(calls).toBe(1);
  });

  it("single-flights concurrent calls on a cold key (one fetcher invocation)", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      await sleep(30);
      return "shared";
    };

    const [a, b] = await Promise.all([
      withCache("test:flight", 60, fetcher),
      withCache("test:flight", 60, fetcher),
    ]);

    expect(a).toBe("shared");
    expect(b).toBe("shared");
    expect(calls).toBe(1);
  });

  it("serves stale to concurrent readers after logical expiry while one caller refreshes", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls > 1) await sleep(30); // make the refresh observable
      return `gen-${calls}`;
    };

    // Populate with a 50ms logical TTL, then let it expire.
    const initial = await withCache("test:stale", 0.05, fetcher);
    expect(initial).toBe("gen-1");
    await sleep(100);

    // First caller after expiry triggers the refresh and gets the new value;
    // the concurrent second caller is served the stale value immediately.
    const p1 = withCache("test:stale", 0.05, fetcher);
    const p2 = withCache("test:stale", 0.05, fetcher);
    const [v1, v2] = await Promise.all([p1, p2]);

    expect(v1).toBe("gen-2");
    expect(v2).toBe("gen-1"); // stale served, no second fetch
    expect(calls).toBe(2);
  });

  it("falls back to the stale value when the refresh fetcher throws", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls > 1) throw new Error("upstream down");
      return "good";
    };

    expect(await withCache("test:stale-on-error", 0.05, fetcher)).toBe("good");
    await sleep(100);

    // Refresh fails; the reader still gets the stale value instead of an error.
    expect(await withCache("test:stale-on-error", 0.05, fetcher)).toBe("good");
    expect(calls).toBe(2);
  });
});
