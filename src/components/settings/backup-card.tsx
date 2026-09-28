import { AlertTriangle, CheckCircle2, HardDriveDownload } from "lucide-react";
import type { BackupHealth, BackupStatus } from "@/lib/backup-status";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
}

// Status der nächtlichen Datensicherung (nur Anzeige; Sicherung läuft per Cron, siehe RESTORE.md)
export function BackupCard({ status, health }: { status: BackupStatus | null; health: BackupHealth }) {
  const bad = health !== "ok";
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <HardDriveDownload className="size-4" />
          Datensicherung
        </h2>
        {bad ? (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="size-3.5" />
            {health === "missing" ? "keine Sicherung gefunden" : health === "failed" ? "letzte Sicherung fehlgeschlagen" : "Sicherung veraltet"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            aktuell
          </span>
        )}
      </div>
      {status && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Letzter Lauf</dt><dd>{fmt(status.finishedAt)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Ergebnis</dt><dd className={status.ok ? "" : "text-destructive"}>{status.message}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Umfang</dt><dd>{(status.bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 0 })} MB · Stand {status.snapshot}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Letzte Test-Wiederherstellung</dt><dd>{status.verifiedAt ? fmt(status.verifiedAt) : "–"}</dd></div>
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        Jede Nacht um 02:15 verschlüsselt auf das NAS (Freigabe „Domora-Backup“, von dort nach OneDrive): Datenbank, Dokumente, Konfiguration.
        Aufbewahrung 14 Tage / 8 Wochen / 24 Monate / 10 Jahre, monatlich Test-Wiederherstellung. Anleitung für den Ernstfall: RESTORE.md.
      </p>
    </section>
  );
}
