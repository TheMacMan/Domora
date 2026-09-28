// Belegverknüpfung von Ausgaben: welche Buchung braucht einen Beleg, welche Dokumente
// kommen als Beleg in Frage. Reine Funktionen, Beträge in Cents.

export type ReceiptExpense = {
  id: string;
  date: string; // YYYY-MM-DD
  amountCents: number;
  propertyId: string | null;
  description: string | null;
  wegAbrechnungId: string | null;
  scheduleId: string | null;
  receiptCount: number;
};

export type ReceiptStatus = "linked" | "missing" | "not_needed";

// Keinen eigenen Beleg brauchen:
// - Posten einer WEG-Jahresabrechnung (Beleg ist die Abrechnung selbst)
// - aus einem Abo erzeugte Buchungen (Beleg ist Vertrag/Wirtschaftsplan am Abo)
// - Nullbuchungen (z. B. nicht gezahlte Rate)
export function needsReceipt(e: Pick<ReceiptExpense, "amountCents" | "wegAbrechnungId" | "scheduleId">): boolean {
  return e.amountCents !== 0 && !e.wegAbrechnungId && !e.scheduleId;
}

export function receiptStatus(e: Pick<ReceiptExpense, "amountCents" | "wegAbrechnungId" | "scheduleId" | "receiptCount">): ReceiptStatus {
  if (e.receiptCount > 0) return "linked";
  return needsReceipt(e) ? "missing" : "not_needed";
}

// Ausgaben ohne Beleg je Jahr (Buchungsjahr)
export function missingReceiptsByYear(list: ReceiptExpense[]): Map<number, { count: number; cents: number }> {
  const out = new Map<number, { count: number; cents: number }>();
  for (const e of list) {
    if (receiptStatus(e) !== "missing") continue;
    const y = parseInt(e.date.slice(0, 4), 10);
    const cur = out.get(y) ?? { count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += e.amountCents;
    out.set(y, cur);
  }
  return out;
}

export type CandidateDoc = {
  id: string;
  filename: string;
  title: string | null;
  year: number | null;
  entityType: string;
  entityId: string;
  createdAt: Date;
};

// Datum aus dem Dateinamen („20251110_Bauhaus.pdf", „2025-11-10 …") → YYYY-MM-DD
export function dateFromFilename(name: string): string | null {
  const m = name.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function dayDiff(a: string, b: string) {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.abs(t(a) - t(b)) / 86_400_000;
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
}

// Dokumente nach Passung zur Ausgabe sortieren: Datum im Dateinamen, Namensähnlichkeit
// (Händler/Stichworte), Objekt und Belegjahr. Nur Dokumente mit Punktzahl > 0.
export function rankReceiptCandidates(
  expense: Pick<ReceiptExpense, "date" | "propertyId" | "description">,
  docs: CandidateDoc[],
  limit = 8,
): CandidateDoc[] {
  const expWords = words(expense.description ?? "");
  const expYear = parseInt(expense.date.slice(0, 4), 10);
  const scored = docs.map((d) => {
    let score = 0;
    const fileDate = dateFromFilename(d.filename);
    if (fileDate) {
      const diff = dayDiff(fileDate, expense.date);
      if (diff === 0) score += 6;
      else if (diff <= 3) score += 4;
      else if (diff <= 14) score += 2;
    }
    const docWords = words(`${d.title ?? ""} ${d.filename}`);
    for (const w of expWords) if (docWords.has(w)) score += 3;
    if (d.entityType === "property" && d.entityId === expense.propertyId) score += 1;
    if (d.year === expYear) score += 1;
    return { d, score };
  });
  return scored
    .filter((s) => s.score > 1)
    .sort((a, b) => b.score - a.score || b.d.createdAt.getTime() - a.d.createdAt.getTime())
    .slice(0, limit)
    .map((s) => s.d);
}
