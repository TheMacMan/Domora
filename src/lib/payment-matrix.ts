// Zahlungs-Übersicht Mietvertrag × Monat (Jahresraster). Reine Funktionen, Beträge in Cents.

export type MatrixCellStatus =
  | "inactive" // Vertrag in diesem Monat nicht aktiv
  | "missing"  // Vertrag aktiv und Monat fällig, aber keine Soll-Stellung erzeugt
  | "paid"     // vollständig bezahlt
  | "partial"  // teilweise bezahlt
  | "overdue"  // fällig, nichts bezahlt
  | "open";    // noch nicht fällig

export type MatrixCell = {
  month: number; // 1–12
  status: MatrixCellStatus;
  paymentId: string | null;
  sollCents: number;
  paidCents: number;
};

export type MatrixRow = {
  leaseId: string;
  cells: MatrixCell[];
  sollCents: number;       // Soll aller fälligen Monate im Jahr
  paidCents: number;       // darauf gezahlt
  rueckstandCents: number; // Soll − Ist der fälligen Monate (≥ 0 je Monat)
};

export type MatrixInput = {
  year: number;
  today: string; // YYYY-MM-DD
  lease: { id: string; startDate: string; endDate: string | null };
  payments: Array<{
    id: string;
    dueDate: string; // YYYY-MM-01
    rentCents: number;
    serviceChargesCents: number | null;
    paidCents: number | null;
  }>;
};

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthEnd(year: number, month: number) {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Aktiv, wenn sich Vertragslaufzeit und Kalendermonat überschneiden
export function leaseActiveInMonth(lease: { startDate: string; endDate: string | null }, year: number, month: number) {
  return lease.startDate <= monthEnd(year, month) && (lease.endDate == null || lease.endDate >= monthStart(year, month));
}

export function cellStatus(
  soll: number,
  paid: number,
  dueDate: string,
  today: string,
): Exclude<MatrixCellStatus, "inactive" | "missing"> {
  if (paid > 0 && paid >= soll) return "paid";
  if (paid > 0) return "partial";
  if (soll === 0) return "paid";
  return dueDate <= today ? "overdue" : "open";
}

export function buildMatrixRow({ year, today, lease, payments }: MatrixInput): MatrixRow {
  const byMonth = new Map(payments.filter((p) => p.dueDate.startsWith(`${year}-`)).map((p) => [p.dueDate.slice(0, 7), p]));
  let sollCents = 0;
  let paidCents = 0;
  let rueckstandCents = 0;

  const cells: MatrixCell[] = [];
  for (let m = 1; m <= 12; m++) {
    const due = monthStart(year, m);
    const p = byMonth.get(due.slice(0, 7));
    if (!p) {
      // Fehlende Soll-Stellung nur für fällige Monate melden — künftige sind einfach noch nicht erzeugt
      const status: MatrixCellStatus = !leaseActiveInMonth(lease, year, m) ? "inactive" : due <= today ? "missing" : "open";
      cells.push({ month: m, status, paymentId: null, sollCents: 0, paidCents: 0 });
      continue;
    }
    const soll = p.rentCents + (p.serviceChargesCents ?? 0);
    const paid = p.paidCents ?? 0;
    const status = cellStatus(soll, paid, p.dueDate, today);
    cells.push({ month: m, status, paymentId: p.id, sollCents: soll, paidCents: paid });
    if (p.dueDate <= today) {
      sollCents += soll;
      paidCents += paid;
      rueckstandCents += Math.max(0, soll - paid);
    }
  }

  return { leaseId: lease.id, cells, sollCents, paidCents, rueckstandCents };
}
