import { describe, it, expect } from "vitest";
import { parseEuroInput } from "../money";

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
