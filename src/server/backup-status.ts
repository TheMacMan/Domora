// Liest data/backup-status.json (kein Server-Action-Modul)
import { readFile } from "fs/promises";
import path from "path";
import { parseBackupStatus, type BackupStatus } from "@/lib/backup-status";

export async function readBackupStatus(): Promise<BackupStatus | null> {
  try {
    return parseBackupStatus(await readFile(path.join(process.cwd(), "data", "backup-status.json"), "utf8"));
  } catch {
    return null;
  }
}
