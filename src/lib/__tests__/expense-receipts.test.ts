import { describe, it, expect } from "vitest";
import {
  needsReceipt,
  receiptStatus,
  missingReceiptsByYear,
  dateFromFilename,
  rankReceiptCandidates,
  type ReceiptExpense,
  type CandidateDoc,
} from "../expense-receipts";

const exp = (over: Partial<ReceiptExpense>): ReceiptExpense => ({
  id: "e", date: "2025-11-10", amountCents: 3_887, propertyId: "p1", description: "Baumarkt – Schrauben",
  wegAbrechnungId: null, scheduleId: null, receiptCount: 0, ...over,
});

const doc = (over: Partial<CandidateDoc>): CandidateDoc => ({
  id: "d", filename: "x.pdf", title: null, year: 2025, entityType: "property", entityId: "p1",
  createdAt: new Date("2026-01-01"), ...over,
});

describe("Belegpflicht", () => {
  it("WEG-Posten, Abo-Buchungen und Nullbuchungen brauchen keinen eigenen Beleg", () => {
    expect(needsReceipt(exp({ wegAbrechnungId: "w" }))).toBe(false);
    expect(needsReceipt(exp({ scheduleId: "s" }))).toBe(false);
    expect(needsReceipt(exp({ amountCents: 0 }))).toBe(false);
    expect(needsReceipt(exp({}))).toBe(true);
    expect(needsReceipt(exp({ amountCents: -78_220 }))).toBe(true); // Erstattung braucht den Bescheid
  });

  it("Status: verknüpft / fehlt / nicht nötig", () => {
    expect(receiptStatus(exp({ receiptCount: 2 }))).toBe("linked");
    expect(receiptStatus(exp({}))).toBe("missing");
    expect(receiptStatus(exp({ scheduleId: "s" }))).toBe("not_needed");
  });

  it("summiert fehlende Belege je Buchungsjahr", () => {
    const m = missingReceiptsByYear([
      exp({ id: "a", date: "2025-03-01", amountCents: 1_000 }),
      exp({ id: "b", date: "2025-04-01", amountCents: 2_500 }),
      exp({ id: "c", date: "2025-05-01", amountCents: 9_999, receiptCount: 1 }),
      exp({ id: "d", date: "2026-01-01", amountCents: 500 }),
      exp({ id: "e", date: "2026-01-01", amountCents: 700, wegAbrechnungId: "w" }),
    ]);
    expect(m.get(2025)).toEqual({ count: 2, cents: 3_500 });
    expect(m.get(2026)).toEqual({ count: 1, cents: 500 });
  });
});

describe("Belegvorschläge", () => {
  it("liest Datum aus Dateinamen", () => {
    expect(dateFromFilename("20251110_toom_2.pdf")).toBe("2025-11-10");
    expect(dateFromFilename("Rechnung 2025-02-18 Holz.pdf")).toBe("2025-02-18");
    expect(dateFromFilename("9209989872.pdf")).toBeNull();
  });

  it("bevorzugt gleiches Datum und passenden Händler", () => {
    const ranked = rankReceiptCandidates(exp({ description: "Baumarkt Schrauben" }), [
      doc({ id: "far", filename: "20250301_Baumarkt.pdf" }),
      doc({ id: "exact", filename: "20251110_Baumarkt.pdf" }),
      doc({ id: "other", filename: "20251110_Maler.pdf" }),
      doc({ id: "unrelated", filename: "Mietvertrag.pdf", year: 2020, entityId: "p2" }),
    ]);
    expect(ranked.map((d) => d.id)).toEqual(["exact", "other", "far"]);
  });
});
