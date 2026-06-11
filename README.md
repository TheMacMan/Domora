# Mietverwaltung

Self-hosted Web-App zur Verwaltung von Wohneinheiten mit Fokus auf vollständige
steuerliche Erfassung (Anlage V), Nebenkostenabrechnung (BetrKV) und Darlehens-Tracking.

Single-User, für den Eigenbedarf des Eigentümers gedacht.

## Tech-Stack

- **Next.js 15** (App Router, React 19, TypeScript strict) – Server Components + Server Actions
- **SQLite + Drizzle ORM** – Geldbeträge konsequent in Cents (Integer)
- **Auth.js v5** – Credentials-Login, argon2id-Hashing
- **Tailwind CSS v4 + shadcn/ui** – deutsche UI, Dark Mode default
- **@react-pdf/renderer** – Anlage V / NK-Abrechnung als PDF
- **recharts** – Cashflow-Charts
- **vitest** – Tests für die Steuerlogik

## Setup

```bash
pnpm install

# .env.local anlegen (siehe unten)
cp .env.example .env.local   # Werte eintragen

pnpm db:migrate              # Migrations anwenden
SEED_PASSWORD=deinPasswort pnpm db:seed   # Admin-User anlegen

pnpm dev                    # http://localhost:3000
```

### Umgebungsvariablen (`.env.local`)

| Variable      | Beschreibung                                   |
|---------------|------------------------------------------------|
| `AUTH_SECRET` | Zufälliger Secret für Auth.js (`openssl rand -base64 32`) |
| `AUTH_URL`    | Basis-URL der App, z. B. `http://localhost:3000` |
| `DATABASE_URL`| Pfad zur SQLite-Datei, z. B. `./data/db.sqlite` |

## Befehle

```bash
pnpm dev          # Entwicklung
pnpm build        # Production build
pnpm test         # vitest
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm db:generate  # Migration aus Schema-Diff
pnpm db:migrate   # Migrations anwenden
pnpm db:studio    # Drizzle Studio
```

## Projektstruktur

Siehe [`CLAUDE.md`](./CLAUDE.md) für Coding-Konventionen und Datei-Layout sowie
[`PRD.md`](./PRD.md) für die Produktanforderungen.

## Hinweis

Die produktive Datenbank (`data/`) und Secrets (`.env.local`) sind per `.gitignore`
ausgeschlossen und nicht Teil dieses Repos.
