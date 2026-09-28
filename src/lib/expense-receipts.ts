// Belegverknüpfung von Ausgaben: welche Belege gelten für eine Buchung (eigene plus
// geerbte vom Abo bzw. von der WEG-Abrechnung), welche Buchung braucht noch einen Beleg,
// welche Dokumente kommen als Beleg in Frage. Reine Funktionen, Beträge in Cents.

export type LinkTargetType = "expense" | "expense_schedule" | "weg_abrechnung" | "vehicle_cost" | "vehicle_year";

export type ReceiptDoc = { id: string; filename: string; title: string | null; mimeType: string };

// Aktive Verknüpfung (gelöste und gelöschte Dokumente sind bereits herausgefiltert)
export type ReceiptLink = { linkId: string; targetType: LinkTargetType; targetId: string; doc: ReceiptDoc };

export type ReceiptSource = "own" | "schedule" | "weg" | "vehicle";

export type ResolvedReceipt = ReceiptLink & { source: ReceiptSource };

// Belege einer Ausgabe: eigene Verknüpfungen, dazu die des Abos, der WEG-Abrechnung und —
// bei Fahrtkosten — die des Fahrzeugjahres und der Fahrzeugkosten (vehicleKeys).
// Ein Dokument erscheint nur einmal (eigene Verknüpfung hat Vorrang).
export function resolveReceipts(
  e: { id: string; scheduleId: string | null; wegAbrechnungId: string | null },
  byTarget: Map<string, ReceiptLink[]>,
  vehicleKeys: string[] = [],
): ResolvedReceipt[] {
  const out: ResolvedReceipt[] = [];
  const seen = new Set<string>();
  const add = (key: string, source: ReceiptSource) => {
    for (const l of byTarget.get(key) ?? []) {
      if (seen.has(l.doc.id)) continue;
      seen.add(l.doc.id);
      out.push({ ...l, source });
    }
  };
  add(`expense:${e.id}`, "own");
  if (e.scheduleId) add(`expense_schedule:${e.scheduleId}`, "schedule");
  if (e.wegAbrechnungId) add(`weg_abrechnung:${e.wegAbrechnungId}`, "weg");
  for (const k of vehicleKeys) add(k, "vehicle");
  return out;
}

export function groupLinksByTarget(links: ReceiptLink[]): Map<string, ReceiptLink[]> {
  const m = new Map<string, ReceiptLink[]>();
  for (const l of links) {
    const k = `${l.targetType}:${l.targetId}`;
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return m;
}

export type ReceiptStatus = "linked" | "missing" | "not_needed";

// Nur Nullbuchungen (z. B. nicht gezahlte Rate) brauchen keinen Beleg. Abo- und
// WEG-Buchungen brauchen einen — er kann am Abo bzw. an der WEG-Abrechnung hängen.
export function needsReceipt(e: { amountCents: number }): boolean {
  return e.amountCents !== 0;
}

export function receiptStatus(e: { amountCents: number; receiptCount: number }): ReceiptStatus {
  if (e.receiptCount > 0) return "linked";
  return needsReceipt(e) ? "missing" : "not_needed";
}

// Bagatellgrenze für die Dashboard-Aufgabe (je Buchung, Betrag)
export const RECEIPT_TASK_MIN_CENTS = 2_000;

// Ausgaben ohne Beleg je Buchungsjahr — ab der Bagatellgrenze
export function missingReceiptsByYear(
  list: Array<{ date: string; amountCents: number; receiptCount: number }>,
  minCents = RECEIPT_TASK_MIN_CENTS,
): Map<number, { count: number; cents: number }> {
  const out = new Map<number, { count: number; cents: number }>();
  for (const e of list) {
    if (receiptStatus(e) !== "missing" || Math.abs(e.amountCents) < minCents) continue;
    const y = parseInt(e.date.slice(0, 4), 10);
    const cur = out.get(y) ?? { count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += e.amountCents;
    out.set(y, cur);
  }
  return out;
}

// Dokument-Kategorie für einen neuen Beleg aus der Ausgabenkategorie vorschlagen
export function tagForExpenseCategory(category: string): string {
  if (category === "maintenance" || category === "capital_expense") return "Handwerker & Renovierung";
  if (category === "bk_grundsteuer" || category === "bk_strasse_muell") return "Grundsteuer & Gebühren";
  if (category === "bk_wasser" || category === "bk_abwasser") return "Wasser & Abwasser";
  if (category === "bk_heizung" || category === "bk_warmwasser" || category === "bk_beleuchtung") return "Energie";
  if (category === "bk_versicherung" || category === "insurance_owner") return "Versicherung";
  if (category.startsWith("weg_")) return "WEG";
  return "Beleg";
}

export type CandidateDoc = {
  id: string;
  filename: string;
  title: string | null;
  tag: string;
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

// Dokumente nach Passung sortieren: Datum im Dateinamen, Namensähnlichkeit, passende
// Kategorie, Objekt und Belegjahr. Nur Dokumente mit Punktzahl > 1.
export function rankReceiptCandidates(
  target: { date: string; propertyId: string | null; description: string | null; tag?: string },
  docs: CandidateDoc[],
  limit = 8,
): CandidateDoc[] {
  const targetWords = words(target.description ?? "");
  const targetYear = parseInt(target.date.slice(0, 4), 10);
  const scored = docs.map((d) => {
    let score = 0;
    const fileDate = dateFromFilename(d.filename);
    if (fileDate) {
      const diff = dayDiff(fileDate, target.date);
      if (diff === 0) score += 6;
      else if (diff <= 3) score += 4;
      else if (diff <= 14) score += 2;
    }
    const docWords = words(`${d.title ?? ""} ${d.filename}`);
    for (const w of targetWords) if (docWords.has(w)) score += 3;
    if (target.tag && target.tag !== "Beleg" && d.tag === target.tag) score += 1;
    if (d.entityType === "property" && d.entityId === target.propertyId) score += 1;
    if (d.year === targetYear) score += 1;
    return { d, score };
  });
  return scored
    .filter((s) => s.score > 1)
    .sort((a, b) => b.score - a.score || b.d.createdAt.getTime() - a.d.createdAt.getTime())
    .slice(0, limit)
    .map((s) => s.d);
}
