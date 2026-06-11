-- Leerstand-Anteil pro NK-Abrechnung × Einheit × Kategorie.
-- Bei festen Verteilerschlüsseln (Fläche / Einheiten / Mix-Flächenanteil) trägt
-- der Vermieter den auf nicht vermietete Monate entfallenden Kostenanteil
-- selbst. Dieser Anteil wird hier separat erfasst — er fließt NICHT in die
-- Mieter-Positionen ein.
CREATE TABLE nk_abrechnung_vacancy (
  id TEXT PRIMARY KEY,
  abrechnung_id TEXT NOT NULL REFERENCES nk_abrechnungen(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  category TEXT NOT NULL,
  vacant_months INTEGER NOT NULL,           -- 1..12
  vacancy_share_cents INTEGER NOT NULL,
  basis_label TEXT,                         -- z.B. "Fläche 90 m² · 4/12 Monate"
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX nk_abrechnung_vacancy_abrechnung_idx ON nk_abrechnung_vacancy(abrechnung_id);
