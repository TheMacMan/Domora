import { describe, it, expect } from "vitest";
import { backupHealth, parseBackupStatus } from "../backup-status";

const json = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ ok: true, startedAt: "2026-09-28T02:15:00+02:00", finishedAt: "2026-09-28T02:15:08+02:00", message: "Sicherung erfolgreich", snapshot: "78ae42d8", bytes: 108_096_153, repository: "/mnt/x", verifiedAt: null, ...over });

describe("Datensicherung", () => {
  const now = new Date("2026-09-29T10:00:00+02:00");
  it("ok innerhalb von 2 Tagen", () => {
    expect(backupHealth(parseBackupStatus(json()), now)).toBe("ok");
  });
  it("veraltet nach mehr als 48 Stunden", () => {
    expect(backupHealth(parseBackupStatus(json({ finishedAt: "2026-09-27T02:00:00+02:00" })), now)).toBe("stale");
  });
  it("fehlgeschlagen", () => {
    expect(backupHealth(parseBackupStatus(json({ ok: false, message: "NAS-Freigabe nicht erreichbar" })), now)).toBe("failed");
  });
  it("fehlt oder unlesbar", () => {
    expect(backupHealth(parseBackupStatus(null), now)).toBe("missing");
    expect(backupHealth(parseBackupStatus("{kaputt"), now)).toBe("missing");
  });
});
