import { describe, expect, it } from "vitest";
import { isYahooNotAuthorized, yahooErrMessage } from "@/lib/adapters/yahoo";

// The yahoo-fantasy SDK rejects with Yahoo's raw payload, not an Error, so
// these shapes (not `new Error(...)`) are what the catch handlers actually see.

describe("isYahooNotAuthorized", () => {
  it("matches the app-level refusal Yahoo has served since 2026-07-27", () => {
    const payload = {
      description: "This application is not authorized to perform this action.",
      detail: "",
    };
    expect(yahooErrMessage(payload)).toMatch(/not authorized/);
    expect(isYahooNotAuthorized(payload)).toBe(true);
  });

  it("does not fire on an expired user token", () => {
    expect(isYahooNotAuthorized({ description: "Please provide valid credentials" })).toBe(false);
    expect(isYahooNotAuthorized(new Error("request failed with status code 500"))).toBe(false);
    expect(isYahooNotAuthorized(null)).toBe(false);
  });
});
