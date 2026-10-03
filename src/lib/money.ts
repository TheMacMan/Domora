export function toCents(euros: number): number {
  return Math.round(euros * 100);
}

export function toEuros(cents: number): number {
  return cents / 100;
}

// Eingabe aus einem Textfeld → Cents. Versteht "1.234,56", "1234,56" und "1234.56".
// Liefert null bei ungültiger Eingabe.
export function parseEuroInput(input: string): number | null {
  const s = input.replace(/\s|€/g, "");
  if (s === "") return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

// Kompakte Anzeige ohne Nachkommastellen (für Charts / KPI-Karten)
export function formatMoneyShort(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Betrag ohne Rundungsdifferenz auf n Teile verteilen: Teil `index` (0-basiert).
// Die ersten |rest| Teile bekommen einen Cent mehr (bei negativen Beträgen weniger),
// sodass die Summe aller Teile genau dem Betrag entspricht.
export function splitCents(totalCents: number, parts: number, index: number): number {
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / parts);
  const rest = abs - base * parts;
  return sign * (base + (index < rest ? 1 : 0));
}
