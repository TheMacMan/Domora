// Zahlungseingänge: Summenbildung und Mietkonto. Alle Beträge in Cents.

export type ReceiptLike = { receivedAt: string; amountCents: number };

// Automatisch gepflegte Summe am Monat (payments.paidCents / paidAt):
// Σ aller aktiven Eingänge und das jüngste Eingangsdatum; ohne Eingänge null/null.
export function aggregateReceipts(receipts: ReceiptLike[]): { paidCents: number | null; paidAt: string | null } {
  if (receipts.length === 0) return { paidCents: null, paidAt: null };
  const paidCents = receipts.reduce((s, r) => s + r.amountCents, 0);
  const paidAt = receipts.reduce((max, r) => (r.receivedAt > max ? r.receivedAt : max), receipts[0]!.receivedAt);
  return { paidCents, paidAt };
}

export type LedgerEntry =
  | { type: "soll"; date: string; paymentId: string; dueDate: string; amountCents: number; balanceCents: number }
  | { type: "receipt"; date: string; paymentId: string | null; dueDate: string | null; amountCents: number; note: string | null; balanceCents: number };

export type RentLedger = {
  entries: LedgerEntry[];
  totalSollCents: number;
  totalReceivedCents: number;
  balanceCents: number; // > 0 = Guthaben des Mieters, < 0 = Rückstand
  currentMonthlySollCents: number | null;
};

// Mietkonto wie ein Kontoauszug: Soll-Buchung je fälligem Monat (≤ Stichtag) und
// jeder Mieteingang mit Datum, chronologisch mit laufendem Saldo.
export function buildRentLedger(input: {
  payments: Array<{ id: string; dueDate: string; rentCents: number; serviceChargesCents: number | null }>;
  receipts: Array<ReceiptLike & { paymentId: string | null; note: string | null }>;
  asOf: string; // YYYY-MM-DD
}): RentLedger {
  const dueById = new Map(input.payments.map((p) => [p.id, p.dueDate]));
  // Omit je Variante der Union (sonst gehen variantenspezifische Felder verloren)
  type Raw = LedgerEntry extends infer E ? (E extends LedgerEntry ? Omit<E, "balanceCents"> : never) : never;
  const raw: Raw[] = [];
  let lastSoll: number | null = null;
  const duePayments = input.payments.filter((p) => p.dueDate <= input.asOf).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const p of duePayments) {
    const soll = p.rentCents + (p.serviceChargesCents ?? 0);
    lastSoll = soll;
    raw.push({ type: "soll", date: p.dueDate, paymentId: p.id, dueDate: p.dueDate, amountCents: -soll });
  }
  for (const r of input.receipts) {
    raw.push({
      type: "receipt",
      date: r.receivedAt,
      paymentId: r.paymentId,
      dueDate: r.paymentId ? dueById.get(r.paymentId) ?? null : null,
      amountCents: r.amountCents,
      note: r.note,
    });
  }
  // Chronologisch; am selben Tag zuerst die Soll-Buchung
  raw.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.type === b.type ? 0 : a.type === "soll" ? -1 : 1));

  let balance = 0;
  const entries = raw.map((e) => {
    balance += e.amountCents;
    return { ...e, balanceCents: balance } as LedgerEntry;
  });
  const totalSollCents = -raw.filter((e) => e.type === "soll").reduce((s, e) => s + e.amountCents, 0);
  const totalReceivedCents = raw.filter((e) => e.type === "receipt").reduce((s, e) => s + e.amountCents, 0);
  return { entries, totalSollCents, totalReceivedCents, balanceCents: totalReceivedCents - totalSollCents, currentMonthlySollCents: lastSoll };
}
