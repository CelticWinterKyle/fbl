import path from "node:path";
import { defineConfig } from "vitest/config";

// Deterministic local time for tests that exercise date logic (season cutoff).
// Workers inherit this env from the config process.
process.env.TZ = "UTC";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
