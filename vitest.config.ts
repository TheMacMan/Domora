import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Playwright-Tests (e2e/) laufen separat über pnpm test:e2e
    exclude: ["**/node_modules/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
