-- Steuerliche Vermieter-Daten + globaler AfA-Default.
ALTER TABLE app_settings ADD COLUMN tax_number TEXT;
ALTER TABLE app_settings ADD COLUMN tax_id TEXT;
ALTER TABLE app_settings ADD COLUMN tax_office TEXT;
-- AfA-Standardsatz für neue Objekte (Permille — 20 = 2,0 %). NULL = kein
-- globaler Default, dann gilt der eingebaute Wert (20).
ALTER TABLE app_settings ADD COLUMN default_depreciation_permille INTEGER;
