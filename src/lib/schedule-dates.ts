// Termine eines Abos: monatlich (Tag im Monat) oder Abschlagsplan mit festen Fälligkeiten
// aus einem Bescheid (z. B. 01.03./01.06./01.09./01.11.). Reine Funktionen.

export type ScheduleOccurrence = {
  // Schlüssel zum Wiederfinden der erzeugten Buchung (Monat des Buchungsdatums)
  key: string;
  // Fälligkeit laut Plan
  dueDate: string;
  // Buchungsdatum: Wochenende → nächster Montag (Bankarbeitstag)
  date: string;
};

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Samstag/Sonntag → folgender Montag (Feiertage bleiben unberücksichtigt)
export function nextBankDay(iso: string): string {
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
  if (wd === 6) return addDays(iso, 2);
  if (wd === 0) return addDays(iso, 1);
  return iso;
}

function isRealDate(iso: string): boolean {
  return ISO.test(iso) && new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso;
}

// „01.03.2026, 1.6.2026; 2026-09-01" → ["2026-03-01", "2026-06-01", "2026-09-01"] (sortiert, ohne Doppelte).
// Ungültige Einträge landen in `invalid`.
export function parseDueDates(input: string): { dates: string[]; invalid: string[] } {
  const dates = new Set<string>();
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    let iso: string | null = null;
    const de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (de) iso = `${de[3]}-${de[2]!.padStart(2, "0")}-${de[1]!.padStart(2, "0")}`;
    else if (ISO.test(raw)) iso = raw;
    if (iso && isRealDate(iso)) dates.add(iso);
    else invalid.push(raw);
  }
  return { dates: [...dates].sort(), invalid };
}

export function formatDueDates(dates: string[]): string {
  return dates.map((d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`).join(", ");
}

// Folgejahr eines Abschlagsplans: gleiche Termine ein Jahr später (29.02. → 28.02.)
export function shiftDueDatesOneYear(dates: string[]): string[] {
  return dates.map((d) => {
    const y = parseInt(d.slice(0, 4), 10) + 1;
    const md = d.slice(5) === "02-29" ? "02-28" : d.slice(5);
    return `${y}-${md}`;
  });
}

function addMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function scheduleOccurrences(
  s: { startMonth: string; endMonth: string | null; dayOfMonth: number; dueDates: string[] | null },
  horizonMonth: string,
): ScheduleOccurrence[] {
  if (s.dueDates && s.dueDates.length > 0) {
    return s.dueDates.map((dueDate) => {
      const date = nextBankDay(dueDate);
      return { key: date.slice(0, 7), dueDate, date };
    });
  }
  const out: ScheduleOccurrence[] = [];
  const end = s.endMonth ?? horizonMonth;
  const day = String(s.dayOfMonth).padStart(2, "0");
  let cur = s.startMonth;
  let safety = 0; // max. 20 Jahre
  while (cur <= end && safety++ < 240) {
    out.push({ key: cur, dueDate: `${cur}-${day}`, date: `${cur}-${day}` });
    cur = addMonth(cur);
  }
  return out;
}

// Zwei Termine im selben Buchungsmonat lassen sich nicht auseinanderhalten
export function duplicateMonths(dates: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const d of dates) {
    const k = nextBankDay(d).slice(0, 7);
    if (seen.has(k)) dup.add(k);
    seen.add(k);
  }
  return [...dup];
}
