import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Pure logic only. The components are covered by the type checker and the
    // production build; what is worth asserting here is arithmetic that would
    // fail silently, like a reporting window that quietly excludes a day.
    include: ["lib/**/*.test.ts"],
  },
});
