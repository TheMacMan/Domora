// Verteilt eine Ausgabe nach dem Leistungsprinzip auf Jahre.
// Wird in der NK-Abrechnung verwendet (Periodenprinzip ist BGH-konformer
// Standard und für verbrauchsabhängige Kosten nach HeizkostenV Pflicht).

type ExpenseLike = {
  date: string;                       // YYYY-MM-DD
  category: string;
  amountCents: number;
  servicePeriodStart: string | null;  // YYYY-MM-DD
  servicePeriodEnd: string | null;    // YYYY-MM-DD
};

// Gibt den Betrag in Cents zurück, der dem Zieljahr nach dem Leistungsprinzip zugeordnet ist.
export function expenseAmountInYear(expense: ExpenseLike, targetYear: number): number {
  // Mit Leistungszeitraum: anteilige Verteilung nach Monaten im Zieljahr
  if (expense.servicePeriodStart && expense.servicePeriodEnd) {
    const [sy, sm] = expense.servicePeriodStart.split("-").map(Number) as [number, number];
    const [ey, em] = expense.servicePeriodEnd.split("-").map(Number) as [number, number];
    const totalMonths = (ey - sy) * 12 + (em - sm) + 1;
    if (totalMonths <= 0) return 0;

    const startYM = `${sy}-${String(sm).padStart(2, "0")}`;
    const endYM = `${ey}-${String(em).padStart(2, "0")}`;
    let monthsInYear = 0;
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const ym = `${targetYear}-${String(monthIdx + 1).padStart(2, "0")}`;
      if (ym >= startYM && ym <= endYM) monthsInYear++;
    }
    if (monthsInYear === 0) return 0;
    return Math.round((expense.amountCents * monthsInYear) / totalMonths);
  }

  // Ohne Leistungszeitraum: Buchungsjahr ist relevant
  // (gilt auch für Grundsteuer, da die Form dort als "Jahr" eingegeben wird → date = YYYY-01-01)
  const bookingYear = parseInt(expense.date.slice(0, 4), 10);
  return bookingYear === targetYear ? expense.amountCents : 0;
}
