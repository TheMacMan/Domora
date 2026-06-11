-- Vergleichsmiete (€/m²) pro Objekt, optional. Cents pro m².
-- Wird auf der Mietentwicklung-Seite zur Ermittlung des Erhöhungspotentials
-- bei Festmietverträgen genutzt (§ 558 BGB).
ALTER TABLE properties ADD COLUMN reference_rent_cents_per_sqm INTEGER;
