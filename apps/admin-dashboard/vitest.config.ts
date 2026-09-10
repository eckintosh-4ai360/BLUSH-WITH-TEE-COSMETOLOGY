import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Pure logic only.
    include: ["lib/**/*.test.ts"],
  },
});
