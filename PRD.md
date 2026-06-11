# PRD – Mietverwaltung "Hörstein"

## 1. Zweck

Self-hosted Web-App zur Verwaltung von 5 Wohneinheiten (Objekt Hörstein).
Primärziel: vollständige steuerliche Erfassung, sodass am Jahresende die **Anlage V** in wenigen Klicks pro Objekt exportiert werden kann.

## 2. Nutzer

- **Single-User**: ausschließlich Eigentümer
- Zugriff über öffentliches Internet → starke Auth Pflicht
- Kein Mieterportal, kein Multi-Tenant

## 3. Tech-Stack (verbindlich)

| Bereich | Wahl | Begründung |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict | Volle SSR/Server Actions, ein Repo |
| UI | Tailwind CSS v4 + shadcn/ui + lucide-react | Moderne UI mit minimalem Aufwand |
| DB | SQLite (WAL-Mode) | Eine Datei, trivial zu backuppen, reicht für 5 Einheiten |
| ORM | Drizzle ORM + drizzle-kit | Typsicher, schlanke Migrations |
| Auth | Auth.js v5 mit Credentials + **Passkey (WebAuthn) + 2FA Pflicht** | Öffentlich erreichbar = höchste Auth-Hürde |
| File Storage | Lokales Volume `./data/uploads`, verschlüsselt at-rest auf NAS | Keine Cloud-Abhängigkeit |
| PDF-Generierung | `@react-pdf/renderer` | Anlage V-Auszüge, Mahnungen |
| Charts | recharts | Liquiditäts-Übersicht |
| Forms/Validation | react-hook-form + zod | Schemas einmal definiert, überall nutzbar |
| Testing | vitest (Logic) + Playwright (E2E für Anlage V Flow) | Steuerlogik MUSS getestet sein |
| Deployment | Docker Compose im LXC auf Proxmox | Snapshots + Backups |
| Reverse Proxy | Caddy (extern) mit automatischem Let's Encrypt | Einfacher als Nginx, HTTPS by default |
| Logging | pino | strukturierte Logs |

## 4. Datenmodell (High-Level)

```
properties (Wohneinheiten)
  ├─ leases (Mietverträge, n:1) ──┬─ tenants (Mieter)
  │                                └─ payments (Mieteingänge)
  ├─ expenses (Ausgaben mit Anlage-V-Kategorie)
  ├─ loans (Darlehen pro Objekt)
  │   └─ loan_payments (mit Tilgung/Zins-Split)
  ├─ depreciation (AfA pro Jahr)
  └─ documents (PDFs, Bilder, verlinkt zu allem)

audit_log (alles was geschrieben wird)
users (genau 1 Eintrag)
```

Detail-Schema → siehe `SCHEMA.md`.

## 5. Features – Phase 1 (MVP, ca. 2–3 Wochenenden)

### 5.1 Stammdaten
- [ ] **Properties CRUD**: Adresse, Wohnfläche, Baujahr, Anschaffungskosten (gesamt + Grund-/Boden-Anteil), Anschaffungsdatum, AfA-Satz (default 2 % linear)
- [ ] **Tenants CRUD**: Kontaktdaten, Notizen
- [ ] **Leases CRUD**: Property + Tenant, Beginn, Ende (oder "unbefristet"), Kaltmiete, NK-Vorauszahlung, Kaution, Mietart (Index/Staffel/Festmiete), Indexsprung-Logik

### 5.2 Zahlungs-Tracking
- [ ] **Payments**: Soll-Generierung pro Monat aus aktivem Lease, manueller Ist-Eintrag
- [ ] **Offene-Posten-Liste** pro Mieter (überfällig markieren)
- [ ] CSV-Import für Bank-Umsätze (vorbereitet, nicht zwingend Phase 1)

### 5.3 Ausgaben (Werbungskosten)
- [ ] **Expense Entry** mit Anlage-V-Kategorie (siehe 5.5), Objekt-Zuordnung (oder anteilig auf alle), Beleg-Upload
- [ ] Wiederkehrende Ausgaben (Versicherung, Grundsteuer) als Vorlage

### 5.4 Darlehen
- [ ] Loans pro Objekt mit Restschuld, Zinssatz, Rate, Tilgung
- [ ] **Loan Payments**: monatliche Rate erzeugen, Aufsplittung Zins/Tilgung automatisch (nach Tilgungsplan)
- [ ] Vorhandenes Darlehen vorbefüllen: Hauptdarlehen und KfW-Darlehen mit jeweiligem Restbetrag, Zinssatz und Monatsrate (konkrete Werte über die UI erfassen)

### 5.5 Anlage V – das Herzstück
Pro Objekt und Kalenderjahr exportierbar als PDF + CSV:

**Einnahmen**
- Mieteinnahmen (Summe Ist-Mieten)
- Umlagen (vom Mieter gezahlte NK-Vorauszahlungen)
- Sonstige Einnahmen

**Werbungskosten** (Kategorien laut Anlage V):
- Schuldzinsen (aus loan_payments des Jahres)
- Erhaltungsaufwand (sofort absetzbar)
- Herstellungs-/Anschaffungs-naher Aufwand (über AfA verteilt – Markierung an Expense)
- AfA (2 % linear vom Gebäudeanteil, automatisch berechnet)
- Grundsteuer
- Versicherungen
- Verwaltungskosten
- Sonstige Werbungskosten
- Nicht umlegbare Nebenkosten

→ Summen-Übersicht + Einzelposten-Liste mit Belegverweis.

### 5.6 Dokumente
- [ ] Upload (PDF, JPG, PNG, max 20 MB)
- [ ] Verknüpfung zu Property / Lease / Tenant / Expense / Payment
- [ ] Tags: Vertrag, Übergabeprotokoll, Beleg, Korrespondenz, Sonstiges
- [ ] Volltextsuche über Dateinamen + Tags

### 5.7 Dashboard
- Liquidität aktueller Monat (Soll/Ist)
- Offene Posten
- Anstehende Termine (Mietanpassung, Vertragsende, BK-Abrechnungs-Frist)
- Mini-Cashflow Chart letzten 12 Monate

## 6. Features – Phase 2 (nach MVP)

- Nebenkostenabrechnung mit Verteilerschlüsseln (Wohnfläche, Personen, Verbrauch)
- Mahnwesen mit Vorlagen
- Index-Mietanpassung halbautomatisch (VPI-Daten manuell pflegen oder per Destatis-Scraping)
- Bank-Statement-Import mit Auto-Matching von Mieteingängen (FinTS via `python-fints` als Sidecar oder simpler CSV-Import)
- iCal-Export der Termine
- Mehrere Standorte/Eigentümer (falls relevant)

## 7. Nicht-funktionale Anforderungen

### 7.1 Security (öffentlich erreichbar!)
- HTTPS ausschließlich, HSTS, secure Cookies
- **Passkey-Login bevorzugt**, Passwort-Login nur mit verpflichtender TOTP-2FA
- Rate-Limit: 5 Login-Versuche / 15 min / IP (z. B. mit `@upstash/ratelimit` lokal oder simplem In-Memory)
- CSP strikt, keine Inline-Scripts außer Next.js generierten
- Session-Cookies HttpOnly + SameSite=Lax
- Audit-Log für alle schreibenden Aktionen
- Backups verschlüsselt (age oder gpg) vor Off-Site-Sync

### 7.2 Backups
- SQLite Online-Backup täglich 03:00 → `./data/backups/YYYY-MM-DD.sqlite.age`
- 30 tägliche, 12 monatliche Versionen
- Restore-Skript dokumentiert + getestet
- Off-Site (Hetzner Storage Box) wöchentlich via `restic` oder `rclone`

### 7.3 DSGVO
- Datenexport pro Mieter (Auskunftsrecht)
- Soft-Delete mit echtem Löschen nach gesetzlicher Aufbewahrungsfrist (10 Jahre für Steuerbelege)
- Hosting innerhalb DE / EU (eigenes NAS = ✓)

### 7.4 Performance
- p95 Server-Response < 200 ms (bei 5 Einheiten leicht erreichbar)
- Initial Page Load < 1.5 s im LAN

## 8. Out of Scope

- Keine Buchhaltung mit doppelter Buchführung – Einnahmen-Überschuss reicht
- Kein OCR auf Belegen (Phase 3+)
- Kein Mailversand an Mieter automatisiert (Phase 2 manuell)
- Kein Mehrsprachigkeit – DE only

## 9. Akzeptanzkriterien MVP

1. Ich kann ein Objekt + Mieter + Vertrag anlegen und sehe automatisch das Soll für die Folgemonate.
2. Ich kann eine Zahlung als "eingegangen" markieren und sehe sie auf dem Dashboard.
3. Ich kann eine Ausgabe mit Beleg hochladen, kategorisieren und einem Objekt zuordnen.
4. Ich kann für **2026** auf Knopfdruck eine Anlage-V-PDF pro Objekt erzeugen, die korrekte Summen aus den unter 1–3 erfassten Daten zeigt.
5. Login ohne 2FA ist nicht möglich.
6. Tägliches Backup liegt am nächsten Morgen verschlüsselt im Backup-Ordner.
