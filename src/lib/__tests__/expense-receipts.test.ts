import { describe, it, expect } from "vitest";
import {
  needsReceipt,
  receiptStatus,
  missingReceiptsByYear,
  resolveReceipts,
  groupLinksByTarget,
  tagForExpenseCategory,
  dateFromFilename,
  rankReceiptCandidates,
  type ReceiptLink,
  type CandidateDoc,
} from "../expense-receipts";

const link = (targetType: ReceiptLink["targetType"], targetId: string, docId: string): ReceiptLink => ({
  linkId: `l-${docId}-${targetId}`, targetType, targetId,
  doc: { id: docId, filename: `${docId}.pdf`, title: null, mimeType: "application/pdf" },
});

const doc = (over: Partial<CandidateDoc>): CandidateDoc => ({
  id: "d", filename: "x.pdf", title: null, tag: "Beleg", year: 2025, entityType: "property", entityId: "p1",
  createdAt: new Date("2026-01-01"), ...over,
});

describe("Belege einer Ausgabe", () => {
  const byTarget = groupLinksByTarget([
    link("expense", "e1", "rechnung"),
    link("expense", "e1", "zahlung"),
    link("expense_schedule", "s1", "wirtschaftsplan"),
    link("weg_abrechnung", "w1", "jahresabrechnung"),
    link("expense", "e2", "wirtschaftsplan"), // auch direkt verknüpft → nur einmal
    link("vehicle_year", "vy1", "fahrtenliste"),
    link("vehicle_cost", "vc1", "leasingvertrag"),
  ]);

  it("Fahrtkosten erben Belege von Fahrzeugjahr und Fahrzeugkosten", () => {
    const r = resolveReceipts({ id: "t1", scheduleId: null, wegAbrechnungId: null }, byTarget, ["vehicle_year:vy1", "vehicle_cost:vc1", "vehicle_cost:ohne"]);
    expect(r.map((x) => [x.doc.id, x.source])).toEqual([["fahrtenliste", "vehicle"], ["leasingvertrag", "vehicle"]]);
  });

  it("eigene Belege", () => {
    const r = resolveReceipts({ id: "e1", scheduleId: null, wegAbrechnungId: null }, byTarget);
    expect(r.map((x) => [x.doc.id, x.source])).toEqual([["rechnung", "own"], ["zahlung", "own"]]);
  });

  it("erbt Belege vom Abo und von der WEG-Abrechnung, ohne Doppelte", () => {
    const r = resolveReceipts({ id: "e2", scheduleId: "s1", wegAbrechnungId: "w1" }, byTarget);
    expect(r.map((x) => [x.doc.id, x.source])).toEqual([["wirtschaftsplan", "own"], ["jahresabrechnung", "weg"]]);
    const r2 = resolveReceipts({ id: "e3", scheduleId: "s1", wegAbrechnungId: null }, byTarget);
    expect(r2.map((x) => x.source)).toEqual(["schedule"]);
  });
});

describe("Belegpflicht", () => {
  it("nur Nullbuchungen brauchen keinen Beleg", () => {
    expect(needsReceipt({ amountCents: 0 })).toBe(false);
    expect(needsReceipt({ amountCents: 57_100 })).toBe(true);
    expect(needsReceipt({ amountCents: -78_220 })).toBe(true); // Erstattung braucht den Bescheid
  });

  it("Status: verknüpft / fehlt / nicht nötig", () => {
    expect(receiptStatus({ amountCents: 100, receiptCount: 2 })).toBe("linked");
    expect(receiptStatus({ amountCents: 100, receiptCount: 0 })).toBe("missing");
    expect(receiptStatus({ amountCents: 0, receiptCount: 0 })).toBe("not_needed");
    // Fahrtkosten: Nachweis ist die Fahrtenliste
    expect(receiptStatus({ amountCents: 7_333, receiptCount: 0, tripId: "t1" })).toBe("trip_log");
    expect(needsReceipt({ amountCents: 7_333, tripId: "t1" })).toBe(false);
  });

  it("zählt fehlende Belege je Jahr ab der Bagatellgrenze von 20 €", () => {
    const m = missingReceiptsByYear([
      { date: "2025-03-01", amountCents: 1_999, receiptCount: 0 }, // unter 20 €
      { date: "2025-04-01", amountCents: 2_500, receiptCount: 0 },
      { date: "2025-04-02", amountCents: -8_335, receiptCount: 0 }, // Erstattung, Betrag zählt
      { date: "2025-05-01", amountCents: 9_999, receiptCount: 1 },
      { date: "2026-01-01", amountCents: 5_000, receiptCount: 0 },
      { date: "2025-11-15", amountCents: 7_333, receiptCount: 0, tripId: "t1" }, // Fahrt zählt nicht
    ]);
    expect(m.get(2025)).toEqual({ count: 2, cents: 2_500 - 8_335 });
    expect(m.get(2026)).toEqual({ count: 1, cents: 5_000 });
  });
});

describe("Belegvorschläge", () => {
  it("Kategorie aus der Ausgabenkategorie", () => {
    expect(tagForExpenseCategory("maintenance")).toBe("Handwerker & Renovierung");
    expect(tagForExpenseCategory("bk_grundsteuer")).toBe("Grundsteuer & Gebühren");
    expect(tagForExpenseCategory("weg_hausgeld")).toBe("WEG");
    expect(tagForExpenseCategory("administration")).toBe("Beleg");
  });

  it("liest Datum aus Dateinamen", () => {
    expect(dateFromFilename("20251110_toom_2.pdf")).toBe("2025-11-10");
    expect(dateFromFilename("Rechnung 2025-02-18 Holz.pdf")).toBe("2025-02-18");
    expect(dateFromFilename("9209989872.pdf")).toBeNull();
  });

  it("bevorzugt gleiches Datum und passenden Händler", () => {
    const ranked = rankReceiptCandidates({ date: "2025-11-10", propertyId: "p1", description: "Baumarkt Schrauben" }, [
      doc({ id: "far", filename: "20250301_Baumarkt.pdf" }),
      doc({ id: "exact", filename: "20251110_Baumarkt.pdf" }),
      doc({ id: "other", filename: "20251110_Maler.pdf" }),
      doc({ id: "unrelated", filename: "Mietvertrag.pdf", year: 2020, entityId: "p2" }),
    ]);
    expect(ranked.map((d) => d.id)).toEqual(["exact", "other", "far"]);
  });
});
