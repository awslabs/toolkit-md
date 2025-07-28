import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/tests/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "^(\\.{1,2}/.*)\\.js$": "$1",
    },
  },
});
