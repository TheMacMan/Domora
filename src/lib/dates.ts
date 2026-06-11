const DE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Datum (YYYY-MM-DD) → "18.05.2026"; null/undefined → fallback
export function formatDate(iso: string | null | undefined, fallback = "–"): string {
  if (!iso) return fallback;
  return DE_FORMATTER.format(new Date(iso));
}

// Date-Objekt → "18.05.2026"
export function formatDateObj(date: Date): string {
  return DE_FORMATTER.format(date);
}

// YYYY-MM → "Mai 26"
export function formatMonthShort(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

// YYYY-MM → "Mai 2026"
export function formatMonthLong(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

// Aktueller Monat als YYYY-MM
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Heutiges Datum in Berliner Lokalzeit als YYYY-MM-DD.
// WICHTIG: `new Date().toISOString().slice(0,10)` liefert UTC und springt für
// Berlin schon abends/nachts ins falsche Datum — daher dieser Helper.
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function todayLocal(): string {
  return LOCAL_DATE_FORMATTER.format(new Date()); // "YYYY-MM-DD"
}

// YYYY-MM um delta Monate verschieben
export function offsetMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// YYYY-MM-DD → erster Tag des Folgemonats
export function nextMonthStart(dueDate: string): string {
  const [y, m] = dueDate.split("-").map(Number) as [number, number];
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
