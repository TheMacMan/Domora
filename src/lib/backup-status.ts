// Status der nächtlichen Datensicherung (geschrieben von scripts/backup.sh nach data/backup-status.json)

export type BackupStatus = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  message: string;
  snapshot: string;
  bytes: number;
  repository: string;
  verifiedAt: string | null;
};

export type BackupHealth = "ok" | "stale" | "failed" | "missing";

// Warnen, wenn die letzte erfolgreiche Sicherung älter als 2 Tage ist
export const BACKUP_MAX_AGE_HOURS = 48;

export function parseBackupStatus(raw: string | null): BackupStatus | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<BackupStatus>;
    if (typeof s.ok !== "boolean" || typeof s.finishedAt !== "string") return null;
    return {
      ok: s.ok,
      startedAt: s.startedAt ?? s.finishedAt,
      finishedAt: s.finishedAt,
      message: s.message ?? "",
      snapshot: s.snapshot ?? "",
      bytes: typeof s.bytes === "number" ? s.bytes : 0,
      repository: s.repository ?? "",
      verifiedAt: s.verifiedAt ?? null,
    };
  } catch {
    return null;
  }
}

export function backupHealth(s: BackupStatus | null, now: Date): BackupHealth {
  if (!s) return "missing";
  if (!s.ok) return "failed";
  const ageH = (now.getTime() - new Date(s.finishedAt).getTime()) / 3_600_000;
  return ageH > BACKUP_MAX_AGE_HOURS ? "stale" : "ok";
}
