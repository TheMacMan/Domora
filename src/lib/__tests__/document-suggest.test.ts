import { describe, it, expect } from "vitest";
import { suggestTag, suggestTitle, suggestYear } from "../document-suggest";

describe("suggestYear", () => {
  it("erkennt Jahr am Anfang, in der Mitte und im Namen", () => {
    expect(suggestYear("2025_Abwassergebühren_Hörstein.pdf")).toBe(2025);
    expect(suggestYear("106987 - EStE 2024 - elektronisch gesendete Erklärung.pdf")).toBe(2024);
    expect(suggestYear("Graichen Strom 2023 Juni-Sept_230925_161304.pdf")).toBe(2023);
  });
  it("ignoriert längere Zahlen und Namen ohne Jahr", () => {
    expect(suggestYear("tibber_invoice_581356.pdf")).toBeNull();
    expect(suggestYear("Personalausweis_Carsten_Schäfer.pdf")).toBeNull();
    expect(suggestYear("Rechnung 12345.pdf")).toBeNull();
  });
});

describe("suggestTag", () => {
  it("Grundsteuer vor Steuer", () => {
    expect(suggestTag("2025_Grundsteuer_Erlensee.pdf")).toBe("Grundsteuer & Gebühren");
  });
  it.each([
    ["2025_Zinsnachweise.pdf", "Darlehen & Zinsen"],
    ["2024_Zinsen_6209854014.pdf", "Darlehen & Zinsen"],
    ["106987 - EStE 2024 - Erklärung.pdf", "Steuer"],
    ["2023_Brandversicherung_Hörstein.pdf", "Versicherung"],
    ["2025_Frischwasser_Hörstein.pdf", "Wasser & Abwasser"],
    ["2024_Gas_Maingau.pdf", "Energie"],
    ["2025_Strom_EVA_Leerstand.pdf", "Energie"],
    ["tibber_invoice_581356.pdf", "Energie"],
    ["Renovierungskosten Laden.xlsx", "Instandhaltung & Renovierung"],
    ["Perso - Nathalie - 1-2.jpg", "Bewerbung & Bonität"],
    ["Entgeltbescheinigung_Carsten_Schäfer.pdf", "Bewerbung & Bonität"],
    ["20251110_Bauhaus.pdf", "Instandhaltung & Renovierung"],
    ["143R2508607473_VermietenPlus.pdf", "Vermietung & Verwaltung"],
    ["Fahrtkosten_2026.xlsx", "Fahrzeug & Fahrten"],
    ["Kaufvertrag_Kapellenstrasse.pdf", "Kauf & Grundbuch"],
    ["Übergabeprotokoll_Carsten_Schäfer.pdf", "Übergabeprotokoll"],
    ["2025_Betriebskostenabrechnung_Erlensee.pdf", "WEG"],
  ])("%s → %s", (name, tag) => {
    expect(suggestTag(name)).toBe(tag);
  });
  it("ohne Treffer null", () => {
    expect(suggestTag("scan_0001.pdf")).toBeNull();
  });
});

describe("suggestTitle", () => {
  it("Datum aus dem Dateinamen ans Ende", () => {
    expect(suggestTitle("20251110_Bauhaus.pdf")).toBe("Bauhaus (10.11.2025)");
    expect(suggestTitle("20251101_Bauhaus_2.pdf")).toBe("Bauhaus 2 (01.11.2025)");
    expect(suggestTitle("2025_Frischwasser_Hörstein.pdf")).toBe("Frischwasser Hörstein 2025");
    expect(suggestTitle("2023-2024_Grundsteuer_Hörstein_WE2.pdf")).toBe("Grundsteuer Hörstein WE2 2023/2024");
    expect(suggestTitle("2026-03_Rechnung.pdf")).toBe("Rechnung Mär 2026");
  });
  it("ohne Datum: Trenner bereinigen", () => {
    expect(suggestTitle("Perso - Nathalie - 1-2.jpg")).toBe("Perso – Nathalie – 1-2");
    expect(suggestTitle("mietvertrag_eg.pdf")).toBe("Mietvertrag eg");
  });
  it("Übergabeprotokoll mit Mietername", () => {
    expect(suggestTitle("Übergabeprotokoll.pdf", { tag: "Übergabeprotokoll", personName: "Max Muster" })).toBe("Übergabeprotokoll Max Muster");
    expect(suggestTitle("Übergabeprotokoll_Muster.pdf", { tag: "Übergabeprotokoll", personName: "Max Muster" })).toBe("Übergabeprotokoll Muster");
  });
});
