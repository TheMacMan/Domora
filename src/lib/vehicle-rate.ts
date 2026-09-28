// Individueller km-Satz je Fahrzeug und Jahr und Fahrtkosten je Fahrt.
// Reine Funktionen, Beträge in Cents.
//
// Satz = Fahrzeugkosten im Nutzungsabschnitt ÷ gefahrene km im Abschnitt (km-Stand Ende − Beginn).
// Fehlen die km-Stände, rechnet die App vorläufig mit den geschätzten km des Jahres.
// Alternative je Jahr: Pauschale 0,30 €/km.

export const FLAT_RATE_CENTS_PER_KM = 30;
// Toleranz, mit der ein km-Stand als Beginn/Ende des Abschnitts gilt
const ODOMETER_TOLERANCE_DAYS = 14;

export type VehicleCostInput = {
  id: string;
  date: string;
  category: string;
  amountCents: number;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
};

export type OdometerInput = { date: string; km: number };

export type VehicleYearInput = {
  year: number;
  vehicle: { inUseFrom: string; inUseTo: string | null };
  method: "actual" | "flat";
  estimatedKm: number | null;
  costs: VehicleCostInput[];
  odometer: OdometerInput[];
};

export type VehicleYearResult = {
  segmentStart: string;
  segmentEnd: string;
  active: boolean;            // Fahrzeug im Jahr überhaupt in Nutzung
  method: "actual" | "flat";
  costCents: number;          // anteilige Kosten im Abschnitt
  costsByCategory: Record<string, number>;
  startKm: number | null;
  endKm: number | null;
  drivenKm: number | null;    // aus km-Ständen
  basisKm: number | null;     // für den Satz verwendete km (gefahren oder geschätzt)
  provisional: boolean;       // km-Stand fehlt → geschätzte km
  rateCentsPerKm: number | null; // ungerundet
};

function t(iso: string) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}
const DAY = 86_400_000;
function days(from: string, to: string) {
  return Math.round((t(to) - t(from)) / DAY) + 1; // inklusive
}
function maxIso(a: string, b: string) { return a > b ? a : b; }
function minIso(a: string, b: string) { return a < b ? a : b; }

// Anteil einer Kostenposition im Abschnitt: mit Leistungszeitraum tageweise anteilig,
// sonst voll, wenn das Datum im Abschnitt liegt.
export function allocateCost(c: VehicleCostInput, segStart: string, segEnd: string): number {
  if (c.servicePeriodStart && c.servicePeriodEnd) {
    const from = maxIso(c.servicePeriodStart, segStart);
    const to = minIso(c.servicePeriodEnd, segEnd);
    if (from > to) return 0;
    return Math.round((c.amountCents * days(from, to)) / days(c.servicePeriodStart, c.servicePeriodEnd));
  }
  return c.date >= segStart && c.date <= segEnd ? c.amountCents : 0;
}

// km-Stand nahe einem Stichtag (± Toleranz), der nächstgelegene gewinnt
export function readingNear(odometer: OdometerInput[], date: string): OdometerInput | null {
  let best: OdometerInput | null = null;
  for (const r of odometer) {
    const diff = Math.abs(t(r.date) - t(date)) / DAY;
    if (diff > ODOMETER_TOLERANCE_DAYS) continue;
    if (!best || diff < Math.abs(t(best.date) - t(date)) / DAY) best = r;
  }
  return best;
}

export function computeVehicleYear(input: VehicleYearInput): VehicleYearResult {
  const segmentStart = maxIso(`${input.year}-01-01`, input.vehicle.inUseFrom);
  const segmentEnd = minIso(`${input.year}-12-31`, input.vehicle.inUseTo ?? `${input.year}-12-31`);
  const active = segmentStart <= segmentEnd;

  const costsByCategory: Record<string, number> = {};
  let costCents = 0;
  if (active) {
    for (const c of input.costs) {
      const a = allocateCost(c, segmentStart, segmentEnd);
      if (a === 0) continue;
      costCents += a;
      costsByCategory[c.category] = (costsByCategory[c.category] ?? 0) + a;
    }
  }

  // Beginn: Stand zum 01.01. bzw. bei Übernahme; Ende: Stand zum 31.12. bzw. bei Rückgabe.
  // Ein Stand vom 31.12. des Vorjahres zählt als Beginn (Toleranz).
  const start = active ? readingNear(input.odometer, segmentStart) : null;
  const end = active ? readingNear(input.odometer, segmentEnd) : null;
  const drivenKm = start && end && end.km > start.km && end.date > start.date ? end.km - start.km : null;
  const provisional = drivenKm == null;
  const basisKm = drivenKm ?? (input.estimatedKm && input.estimatedKm > 0 ? input.estimatedKm : null);

  let rateCentsPerKm: number | null = null;
  if (input.method === "flat") rateCentsPerKm = FLAT_RATE_CENTS_PER_KM;
  else if (basisKm) rateCentsPerKm = costCents / basisKm;

  return {
    segmentStart,
    segmentEnd,
    active,
    method: input.method,
    costCents,
    costsByCategory,
    startKm: start?.km ?? null,
    endKm: end?.km ?? null,
    drivenKm,
    basisKm,
    // Pauschale braucht keinen km-Stand
    provisional: input.method === "actual" && provisional,
    rateCentsPerKm,
  };
}

// Betrag einer Fahrt: km × Kosten ÷ Basis-km, erst am Ende auf Cent gerundet.
export function tripAmountCents(km: number, r: Pick<VehicleYearResult, "method" | "costCents" | "basisKm">): number | null {
  if (r.method === "flat") return Math.round(km * FLAT_RATE_CENTS_PER_KM);
  if (!r.basisKm) return null;
  return Math.round((km * r.costCents) / r.basisKm);
}

export function formatRate(rateCentsPerKm: number): string {
  return (rateCentsPerKm / 100).toLocaleString("de-DE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// Häufig angefahrene Objekte (Hinweis „regelmäßige Tätigkeitsstätte")
export const FREQUENT_TRIPS_PER_YEAR = 60;
export function frequentDestinations(tripsList: Array<{ propertyId: string; date: string }>, threshold = FREQUENT_TRIPS_PER_YEAR) {
  const counts = new Map<string, number>();
  for (const tr of tripsList) {
    const k = `${tr.propertyId}|${tr.date.slice(0, 4)}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .map(([k, count]) => {
      const [propertyId, year] = k.split("|") as [string, string];
      return { propertyId, year: +year, count };
    });
}
