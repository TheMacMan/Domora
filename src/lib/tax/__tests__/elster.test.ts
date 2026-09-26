import { describe, it, expect } from "vitest";
import { buildElsterAnlageV, euroIncome, euroExpense, type ElsterInput } from "../elster";

function input(overrides: Partial<ElsterInput> = {}): ElsterInput {
  return {
    year: 2025,
    property: { street: "Musterweg 1", postalCode: "12345", city: "Musterstadt", purchaseDate: "2014-07-01" },
    rentByUnit: [
      { unitName: "EG", cents: 600_050 },
      { unitName: "OG", cents: 400_000 },
    ],
    umlagenLaufendCents: 240_000,
    nkAbrechnungCents: -12_345,
    afaItems: [
      { method: "linear", rateBps: 200, basisMode: "prior_year", explanation: null, annualCents: 486_800 },
      { method: "degressive", rateBps: 125, basisMode: "explanation", explanation: "Altbau", annualCents: 119_800 },
    ],
    afaFallbackCents: null,
    loans: [
      { label: "Darlehen A (Vertrag 1)", interestCents: 213_934 },
      { label: "Darlehen B (Vertrag 2)", interestCents: 0 },
    ],
    expenses: [
      { category: "maintenance", cents: 22_919, date: "2025-01-17", description: "Reparatur Eckventil" },
      { category: "maintenance", cents: 4_190, date: "2025-04-14", description: "Algizid" },
      { category: "bk_grundsteuer", cents: 33_112, date: "2025-01-01", description: "Grundsteuer" },
      { category: "bk_wasser", cents: 28_700, date: "2025-03-03", description: "Abschlag 1" },
      { category: "bk_wasser", cents: -78_220, date: "2025-02-05", description: "Erstattung 2024" },
      { category: "bk_versicherung", cents: 7_618, date: "2025-01-01", description: "Gebäude" },
      { category: "administration", cents: 8_310, date: "2025-12-31", description: "ImmoScout" },
      { category: "other", cents: 7_333, date: "2025-11-15", description: "Fahrtkosten – Baustelle" },
      { category: "other", cents: 575, date: "2025-12-30", description: "Kontoauszugspreis Darlehen 1" },
      { category: "other", cents: 15_631, date: "2025-06-01", description: "Lizenz Software" },
      { category: "non_allocable_other", cents: 2_000, date: "2025-10-01", description: "Strom Leerstand" },
      { category: "weg_hausgeld", cents: 57_100, date: "2025-01-01", description: "Hausgeld" },
    ],
    ...overrides,
  };
}

describe("ELSTER-Rundung", () => {
  it("rundet Einnahmen ab und Werbungskosten auf", () => {
    expect(euroIncome(600_050)).toBe(6_000);
    expect(euroExpense(22_919)).toBe(230);
    expect(euroExpense(100_000)).toBe(1_000);
    expect(euroIncome(-12_345)).toBe(-124);
    expect(euroExpense(-78_220)).toBe(-782);
  });
});

describe("buildElsterAnlageV", () => {
  const r = buildElsterAnlageV(input());

  it("Einnahmen: Zeile 13 je Einheit, 15 Summe, 20/21 Umlagen, 32 Gesamt", () => {
    const [mieten, umlagen] = r.einnahmen;
    expect(mieten!.entries.map((e) => [e.zeile, e.label, e.euro])).toEqual([
      ["13", "EG", 6_000],
      ["13", "OG", 4_000],
    ]);
    expect(mieten!.sum).toMatchObject({ zeile: "15", cents: 1_000_050, euro: 10_000 });
    expect(umlagen!.entries.map((e) => [e.zeile, e.cents])).toEqual([["20", 240_000], ["21", -12_345]]);
    expect(r.summeEinnahmen.cents).toBe(1_000_050 + 240_000 - 12_345);
  });

  it("AfA je Posten in Zeile 33 mit Art und Prozent, Summe Zeile 35", () => {
    const afa = r.werbungskosten[0]!;
    expect(afa.entries.map((e) => e.label)).toEqual([
      "AfA linear 2 % – wie Vorjahr",
      "AfA degressiv 1,25 % – laut Erläuterung",
    ]);
    expect(afa.entries[1]!.hint).toBe("Altbau");
    expect(afa.sum).toMatchObject({ zeile: "35", cents: 606_600 });
  });

  it("Schuldzinsen je Darlehen in Zeile 46, Darlehen ohne Zinsen entfallen", () => {
    const zinsen = r.werbungskosten[1]!;
    expect(zinsen.entries).toHaveLength(1);
    expect(zinsen.entries[0]).toMatchObject({ zeile: "46", label: "Darlehen A (Vertrag 1)", euro: 2_140 });
    expect(zinsen.sum).toMatchObject({ zeile: "48", cents: 213_934 });
  });

  it("Erhaltung als ein Eintrag in Zeile 55 mit chronologischer Einzelaufstellung", () => {
    const erh = r.werbungskosten[2]!;
    expect(erh.entries).toHaveLength(1);
    expect(erh.entries[0]).toMatchObject({ zeile: "55", cents: 27_109 });
    expect(erh.entries[0]!.items!.map((i) => i.date)).toEqual(["2025-01-17", "2025-04-14"]);
  });

  it("Umgelegte Kosten je Kostenart in Zeile 73 (Erstattungen mindern), Summe 75", () => {
    const umg = r.werbungskosten[3]!;
    expect(umg.entries.map((e) => [e.zeile, e.label, e.cents])).toEqual([
      ["73", "Grundsteuer", 33_112],
      ["73", "Wasserversorgung", 28_700 - 78_220],
      ["73", "Hausversicherungen", 7_618],
    ]);
    expect(umg.sum!.zeile).toBe("75");
  });

  it("Nicht umgelegte Kosten gruppiert in Zeile 76, WEG-Hausgeld ignoriert", () => {
    const nu = r.werbungskosten[4]!;
    expect(Object.fromEntries(nu.entries.map((e) => [e.label, e.cents]))).toEqual({
      "Verwaltungskosten": 8_310,
      "Fahrtkosten": 7_333,
      "Kontoführungs- und Darlehensgebühren": 575,
      "Sonstige Werbungskosten": 15_631,
      "Nicht umlegbare Betriebskosten (z. B. Leerstand)": 2_000,
    });
    expect(nu.sum!.zeile).toBe("78");
    const all = r.werbungskosten.flatMap((s) => s.entries.flatMap((e) => e.items ?? []));
    expect(all.some((i) => i.label === "Hausgeld")).toBe(false);
  });

  it("Summe Werbungskosten (Zeile 83) und Überschuss (Zeile 85) sind konsistent", () => {
    const wk = r.werbungskosten.flatMap((s) => s.entries).reduce((s, e) => s + e.cents, 0);
    expect(r.summeWerbungskosten.cents).toBe(wk);
    expect(r.ueberschuss.cents).toBe(r.summeEinnahmen.cents - wk);
    expect(r.ueberschuss.euro).toBe(r.summeEinnahmen.euro - r.summeWerbungskosten.euro);
  });

  it("AfA-Fallback ohne Posten und Warnung bei Herstellungsaufwand", () => {
    const r2 = buildElsterAnlageV(input({
      afaItems: [],
      afaFallbackCents: 300_000,
      expenses: [{ category: "capital_expense", cents: 500_000, date: "2025-05-01", description: "Anbau" }],
    }));
    expect(r2.werbungskosten[0]!.entries[0]).toMatchObject({ zeile: "33", cents: 300_000 });
    // AfA + Schuldzinsen, der Herstellungsaufwand zählt nicht mit
    expect(r2.summeWerbungskosten.cents).toBe(300_000 + 213_934);
    expect(r2.warnings.some((w) => w.text.includes("Herstellungs"))).toBe(true);
  });

  it("Allgemeine Angaben mit Anschaffungsdatum in Zeile 7", () => {
    expect(r.allgemein.find((a) => a.zeile === "7")?.value).toBe("01.07.2014");
  });
});
