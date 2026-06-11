# Bekannte Probleme: Datenbank-Migrationen

> Stand: 2026-06-12. Dokumentation eines bekannten Zustands — **noch nicht behoben**.
> Migrationen werden laut `CLAUDE.md` nicht ohne ausdrückliche Freigabe geändert.

Die laufende Produktiv-DB (`data/db.sqlite`) ist funktionsfähig; die Migrationen
wurden dort offenbar von Hand angewendet. Die folgenden Inkonsistenzen betreffen
vor allem **frische Setups** (`pnpm db:migrate` auf leerer DB) und die
Reproduzierbarkeit.

## 1. Journal kennt 0022–0026 nicht (Hauptproblem)

`src/db/migrations/meta/_journal.json` enthält nur Einträge bis `0021_serious_gunslinger`
(idx 21). Es existieren aber Migrationsdateien:

- `0022_expense_schedules.sql`
- `0023_property_reference_rent.sql`
- `0024_app_settings_destatis_token.sql`
- `0025_app_settings_tax_and_afa.sql`
- `0026_nk_abrechnung_vacancy.sql`

Da `drizzle-kit migrate` ausschließlich die im Journal registrierten Migrationen
anwendet, würden **0022–0026 auf einer frischen DB nicht laufen** → unvollständiges
Schema (fehlende Tabellen/Spalten wie `expense_schedules`, `reference_rent`,
`destatis_token`, AfA-Felder, NK-Leerstand).

## 2. Verwaiste Migrationsdatei mit 0017

Es gibt zwei Dateien mit Präfix `0017`:

- `0017_tan_tomas.sql` — **im Journal registriert** (idx 17)
- `0017_loans_initial_amount_nullable.sql` — **nicht** im Journal → verwaist

## 3. Fehlende Meta-Snapshots

Unter `src/db/migrations/meta/` fehlen Snapshots für: `0015`, `0016`, `0020`,
`0022`, `0023`, `0024`, `0025`, `0026`. Die Migrationen wurden offenbar teils
von Hand erstellt statt durchgängig über `drizzle-kit generate` (erkennbar auch
an den manuell gesetzten, runden `when`-Timestamps im Journal, z. B. 0015/0016/0020).

## Empfohlene Behebung (wenn freigegeben)

1. `_journal.json` um die Einträge 0022–0026 ergänzen (korrekte `idx`, `tag`, `when`).
2. Fehlende Meta-Snapshots erzeugen bzw. den Migrations-Stand via
   `drizzle-kit generate` gegen `schema.ts` neu synchronisieren.
3. Verwaiste `0017_loans_initial_amount_nullable.sql` entfernen (Inhalt prüfen,
   ob er bereits durch `0017_tan_tomas.sql` oder eine spätere Migration abgedeckt ist).
4. Gegenprobe: `pnpm db:migrate` auf einer **frischen** SQLite-Datei laufen lassen
   und Schema mit `schema.ts` vergleichen (z. B. `drizzle-kit check`).

⚠️ Vor jeder Änderung: Backup der Produktiv-DB. Bereits angewendete Migrationen
nicht inhaltlich verändern — nur Journal/Snapshots in Einklang bringen.
