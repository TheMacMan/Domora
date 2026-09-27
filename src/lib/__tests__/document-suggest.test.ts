import { describe, it, expect } from "vitest";
import { suggestTag, suggestYear } from "../document-suggest";

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
  it.each([
    ["2025_Zinsnachweise.pdf", "Darlehen & Zinsen"],
    ["2024_Zinsen_6209854014.pdf", "Darlehen & Zinsen"],
    ["106987 - EStE 2024 - Erklärung.pdf", "Steuer"],
    ["2023_Brandversicherung_Hörstein.pdf", "Versicherung"],
    ["2025_Frischwasser_Hörstein.pdf", "Wasser & Abwasser"],
    ["2024_Gas_Maingau.pdf", "Energie"],
    ["2025_Strom_EVA_Leerstand.pdf", "Energie"],
    ["tibber_invoice_581356.pdf", "Energie"],
    ["Renovierungskosten Laden.xlsx", "Handwerker & Renovierung"],
    ["Perso - Nathalie - 1-2.jpg", "Personalausweis"],
    ["Entgeltbescheinigung_Carsten_Schäfer.pdf", "Verdienstnachweis"],
    ["Übergabeprotokoll_Carsten_Schäfer.pdf", "Übergabeprotokoll"],
  ])("%s → %s", (name, tag) => {
    expect(suggestTag(name)).toBe(tag);
  });
  it("ohne Treffer null", () => {
    expect(suggestTag("scan_0001.pdf")).toBeNull();
  });
});
