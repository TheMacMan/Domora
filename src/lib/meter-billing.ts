// Abrechnung von Zwischenzählern (Strom über den Vertrag eines Mieters). Reine Funktionen.
//
// Verbrauch = Zählerstand Ende − Zählerstand Beginn. Liegt an einem Stichtag kein Stand vor, wird
// zwischen den nächstgelegenen Ständen linear interpoliert (gekennzeichnet). Ohne Zähler
// (kind "estimate") wird der geschätzte Jahresverbrauch tageweise verteilt.
// Preis: Arbeitspreis des Mieters mit dem Stromvertrag, abschnittsweise ab „gültig ab".

export type MeterInput = {
  id: string;
  name: string;
  kind: "meter" | "estimate";
  purpose: "heating" | "common" | "unit";
  estimateKwhPerYear: number | null;
  readings: Array<{ date: string; value: number }>;
};

export type PriceInput = { validFrom: string; ctPerKwh: number };

export type BillingLine = {
  meterId: string;
  meterName: string;
  purpose: MeterInput["purpose"];
  from: string;
  to: string;
  startValue: number | null;
  endValue: number | null;
  kwh: number;
  ctPerKwh: number;
  cents: number;
  estimated: boolean;     // Schätzung (kein Zähler)
  interpolated: boolean;  // Zählerstand an einem Stichtag interpoliert
};

export type BillingResult =
  | { ok: true; lines: BillingLine[]; kwh: number; cents: number }
  | { ok: false; error: string };

const DAY = 86_400_000;
function t(iso: string) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}
function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number) {
  return iso(t(d) + n * DAY);
}
// Tage zwischen zwei Stichtagen (Ende exklusiv gedacht: Stand am Morgen des Tages)
function span(a: string, b: string) {
  return Math.round((t(b) - t(a)) / DAY);
}

// Zählerstand an einem Datum: exakt oder linear interpoliert; außerhalb der Stände → null
export function valueAt(readings: MeterInput["readings"], date: string): { value: number; interpolated: boolean } | null {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const exact = sorted.find((r) => r.date === date);
  if (exact) return { value: exact.value, interpolated: false };
  let before: (typeof sorted)[number] | undefined;
  let after: (typeof sorted)[number] | undefined;
  for (const r of sorted) {
    if (r.date < date) before = r;
    else if (r.date > date && !after) after = r;
  }
  if (!before || !after) return null;
  const f = span(before.date, date) / span(before.date, after.date);
  return { value: before.value + (after.value - before.value) * f, interpolated: true };
}

// Preisabschnitte im Zeitraum [from, to) — to = Stichtag der Endablesung
export function priceSegments(prices: PriceInput[], from: string, to: string): Array<{ from: string; to: string; ctPerKwh: number }> | null {
  const sorted = [...prices].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const first = [...sorted].reverse().find((p) => p.validFrom <= from);
  if (!first) return null;
  const segs: Array<{ from: string; to: string; ctPerKwh: number }> = [];
  let cur = { from, ctPerKwh: first.ctPerKwh };
  for (const p of sorted) {
    if (p.validFrom > from && p.validFrom < to) {
      segs.push({ from: cur.from, to: p.validFrom, ctPerKwh: cur.ctPerKwh });
      cur = { from: p.validFrom, ctPerKwh: p.ctPerKwh };
    }
  }
  segs.push({ from: cur.from, to, ctPerKwh: cur.ctPerKwh });
  return segs;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Abrechnung mehrerer Zähler für den Zeitraum from → to (Zählerstände an beiden Stichtagen)
export function billMeters(meters: MeterInput[], prices: PriceInput[], from: string, to: string): BillingResult {
  if (to <= from) return { ok: false, error: "Ende muss nach dem Beginn liegen." };
  const segs = priceSegments(prices, from, to);
  if (!segs) return { ok: false, error: `Kein Strompreis gültig ab ${from.split("-").reverse().join(".")} hinterlegt.` };
  const lines: BillingLine[] = [];
  for (const m of meters) {
    for (const s of segs) {
      let kwh: number;
      let startValue: number | null = null;
      let endValue: number | null = null;
      let interpolated = false;
      if (m.kind === "estimate") {
        if (!m.estimateKwhPerYear) return { ok: false, error: `${m.name}: kein geschätzter Jahresverbrauch hinterlegt.` };
        kwh = (m.estimateKwhPerYear * span(s.from, s.to)) / 365;
      } else {
        const a = valueAt(m.readings, s.from);
        const b = valueAt(m.readings, s.to);
        if (!a) return { ok: false, error: `${m.name}: Zählerstand zum ${s.from.split("-").reverse().join(".")} fehlt.` };
        if (!b) return { ok: false, error: `${m.name}: Zählerstand zum ${s.to.split("-").reverse().join(".")} fehlt.` };
        if (b.value < a.value) return { ok: false, error: `${m.name}: Zählerstand am Ende kleiner als am Beginn.` };
        startValue = round3(a.value);
        endValue = round3(b.value);
        kwh = b.value - a.value;
        interpolated = a.interpolated || b.interpolated;
      }
      kwh = round3(kwh);
      lines.push({
        meterId: m.id, meterName: m.name, purpose: m.purpose, from: s.from, to: s.to,
        startValue, endValue, kwh, ctPerKwh: s.ctPerKwh,
        cents: Math.round(kwh * s.ctPerKwh), estimated: m.kind === "estimate", interpolated,
      });
    }
  }
  return {
    ok: true,
    lines,
    kwh: round3(lines.reduce((x, l) => x + l.kwh, 0)),
    cents: lines.reduce((x, l) => x + l.cents, 0),
  };
}

// Kategorie der erzeugten Buchung je Zweck (Erstattung an den Mieter mit dem Stromvertrag)
export const PURPOSE_CATEGORY = { heating: "bk_heizung", common: "bk_beleuchtung", unit: "bk_sonstige" } as const;
export const PURPOSE_LABEL = { heating: "Heizungsstrom", common: "Allgemeinstrom", unit: "Wohnungsstrom" } as const;
