import { defineConfig, devices } from "@playwright/test";

// iPhone-Prüfung gegen die laufende Instanz (nur lesend: Seiten aufrufen, messen, Screenshots).
// Anmeldung ohne Passwort über ein serverseitig erzeugtes Sitzungs-Cookie (e2e/auth.setup.ts).
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "iphone",
      testMatch: /mobile\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["iPhone 15"], storageState: "e2e/.auth/state.json" },
    },
  ],
});
