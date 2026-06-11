# CLAUDE.md

Hinweise für Claude Code in diesem Repo. Diese Datei wird bei jedem `claude`-Start eingelesen.

## Was ist das?

Self-hosted Mietverwaltung für 5 Wohneinheiten. Steuerlogik (Anlage V) ist Kern des Produkts.
**Lies vor jedem größeren Change `PRD.md`.** Bei Konflikt zwischen User-Request und PRD: kurz nachfragen.

## Coding-Regeln

### TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`
- Keine `any`. Wenn unbekannt: `unknown` + zod-Validierung.
- Keine impliziten Returns in Server Actions – immer typisierter Return.

### Next.js
- App Router, **Server Components by default**. `"use client"` nur wo nötig (Form-State, Interaktion).
- Datenmutationen ausschließlich über **Server Actions**, niemals via Client-fetch zu eigenen API-Routen.
- `revalidatePath` / `revalidateTag` nach jeder Mutation.
- Kein `getServerSession` o.ä. außerhalb von Server Components / Actions.

### Datenbank (Drizzle + SQLite)
- Schema in `src/db/schema.ts`. Änderungen → neue Migration via `pnpm drizzle-kit generate`.
- **Niemals** Migration manuell editieren nachdem sie committed wurde.
- IDs: `cuid2` als Text-PK, NICHT autoincrement.
- Geldbeträge: **immer in Cents als INTEGER** speichern. Helper: `src/lib/money.ts`.
- Datumsfelder: ISO-Strings (`text` mit Format `YYYY-MM-DD`) für reine Daten, Unix-Timestamps für Zeitpunkte.
- Soft Delete: `deletedAt` Spalte, niemals echte DELETEs außer beim 10-Jahre-Cleanup-Job.

### Geldlogik – kritisch
- Alle Berechnungen in Cents.
- Rundung nur an UI-Grenze, mit `Math.round` auf Cent-Basis.
- Steuer-Summen MÜSSEN durch Vitest-Tests in `src/lib/tax/__tests__/` abgedeckt sein bevor sie in PDF einfließen.

### UI
- shadcn/ui Komponenten bevorzugen, neue nur wenn keine passt.
- Dark Mode default, Light Mode toggelbar.
- Sprache: **Deutsch** (UI-Strings, Fehlermeldungen, PDF-Output).
- Datumsformat: `dd.MM.yyyy`, Geldformat: `1.234,56 €` (de-DE Locale).

### Auth
- Auth-Logik in `src/lib/auth/`. Nicht woanders Sessions checken.
- Jede Server Action ruft als ersten Schritt `requireUser()` auf.
- Passwort-Hashes mit `argon2id`, niemals bcrypt/PBKDF2.

### Logging
- `pino` über `src/lib/logger.ts`. Keine `console.log` in Production-Code.
- Audit-Log: jede schreibende Server Action erzeugt Eintrag in `audit_log` (User, Action, Entity, Before/After-Snapshot).

### Errors
- Server Actions returnen `{ ok: true, data } | { ok: false, error }` (niemals throw an Client).
- Echte Programmierfehler → throw, werden von Next.js error.tsx gefangen.

## File Layout

```
src/
  app/                  # App Router routes
    (auth)/             # Login, 2FA-Setup
    (app)/              # Authentifizierter Bereich
      dashboard/
      properties/
      tenants/
      leases/
      payments/
      expenses/
      loans/
      documents/
      tax/              # Anlage V Export
      settings/
  components/
    ui/                 # shadcn (generiert, nicht von Hand editieren außer Theme)
    forms/              # wiederverwendbare Form-Felder
    [feature]/          # feature-spezifische Komponenten
  db/
    schema.ts
    migrations/
    index.ts
  lib/
    auth/
    money.ts
    logger.ts
    tax/                # Anlage V Berechnung – getestet!
    pdf/                # PDF-Generierung
    validators/         # zod schemas
  server/
    actions/            # Server Actions, gegliedert nach Feature
```

## Workflow für neue Features

1. **Lies `PRD.md` Abschnitt für das Feature.** Falls unklar oder Lücke → frag mich.
2. Schema-Änderung? → `src/db/schema.ts` editieren, dann `pnpm db:generate` und `pnpm db:migrate`.
3. zod-Schema in `src/lib/validators/`.
4. Server Action in `src/server/actions/`.
5. UI-Page/Component.
6. Test: bei Geldlogik **immer**, bei UI nur falls komplex.
7. **Git commit pro Feature-Schritt**, nicht alles in einen riesigen Commit.

## Was NICHT ohne Rückfrage tun

- Schema-Migrations löschen oder umstrukturieren
- Auth-Mechanismus ändern
- Anlage-V-Berechnungslogik ohne neuen Test ändern
- `.env`-Variablen umbenennen
- Dependencies upgraden, die nicht explizit gewünscht sind
- Dateien in `data/` anfassen
- Deployment-Konfiguration im laufenden Betrieb ändern

## Befehle

```bash
pnpm dev                # Entwicklung
pnpm build              # Production build
pnpm db:generate        # Migration aus Schema-Diff erzeugen
pnpm db:migrate         # Migrations gegen DB anwenden
pnpm db:studio          # Drizzle Studio
pnpm test               # vitest
pnpm test:e2e           # Playwright
pnpm lint               # eslint
pnpm typecheck          # tsc --noEmit
```

`pnpm typecheck && pnpm lint && pnpm test` muss vor jedem Commit grün sein.

## Sensible Daten

- Echte Mieterdaten **niemals** in Test-Fixtures, Seed-Daten oder Logs schreiben.
- Test-Fixtures: erfundene Namen, Anonymisierung verpflichtend.
- Bei Bug-Reports keine Daten aus der Prod-DB in Issues kopieren.
