import { describe, it, expect } from "vitest";
import { parseEuroInput, splitCents } from "../money";

describe("parseEuroInput", () => {
  it("versteht deutsche Schreibweise mit Tausenderpunkt", () => {
    expect(parseEuroInput("1.234,56")).toBe(123456);
    expect(parseEuroInput("550,00 €")).toBe(55000);
    expect(parseEuroInput("0,5")).toBe(50);
  });

  it("versteht Punkt als Dezimaltrenner ohne Komma", () => {
    expect(parseEuroInput("1234.56")).toBe(123456);
    expect(parseEuroInput("550")).toBe(55000);
  });

  it("lehnt Ungültiges ab", () => {
    expect(parseEuroInput("")).toBeNull();
    expect(parseEuroInput("abc")).toBeNull();
    expect(parseEuroInput("12,345")).toBeNull();
  });
});

describe("splitCents", () => {
  it("verteilt ohne Rundungsdifferenz", () => {
    const parts = [0, 1].map((i) => splitCents(1385, 2, i));
    expect(parts).toEqual([693, 692]);
    expect(parts[0]! + parts[1]!).toBe(1385);
    expect([0, 1, 2].map((i) => splitCents(1000, 3, i))).toEqual([334, 333, 333]);
    expect([0, 1].map((i) => splitCents(-1385, 2, i))).toEqual([-693, -692]);
    expect(splitCents(1200, 2, 1)).toBe(600);
  });
});
