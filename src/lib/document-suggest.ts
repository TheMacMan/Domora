// Vorschläge für Jahr und Kategorie aus dem Dateinamen (z. B. „2025_Abwassergebühren_Hörstein.pdf“).

import type { DocumentTag } from "@/lib/validators/document";

// Erstes plausibles Jahr (1990–2099) als eigenständige Zahl im Namen
export function suggestYear(filename: string): number | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const m = base.match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  return y >= 1990 && y <= 2099 ? y : null;
}

// Stichworte → Kategorie; erste passende Regel gewinnt
const RULES: Array<[RegExp, DocumentTag]> = [
  // Grundsteuer vor „Steuer", sonst landen Grundsteuerbescheide unter Steuer
  [/grundsteuer|grundbesitzabgabe/i, "Grundsteuer & Gebühren"],
  [/kaufvertrag|grundbuch|teilungserkl|notar|energieausweis/i, "Kauf & Grundbuch"],
  [/zins|darlehen|kredit|tilgung|bauspar/i, "Darlehen & Zinsen"],
  [/fahrten|fahrtkosten|leasing|kfz|reifen|tankbeleg/i, "Fahrzeug & Fahrten"],
  [/immoscout|immowelt|kleinanzeigen|inserat|vermietenplus|roomsketcher|hausverwalt/i, "Vermietung & Verwaltung"],
  [/nebenkostenabrechnung|nk-abrechnung|stromabrechnung.*mieter|strom-\d{4}/i, "Abrechnungen an Mieter"],
  [/este|steuer(?!n?ummer)|anlage[ _-]?v|bescheid.*finanzamt|elster/i, "Steuer"],
  [/versicherung|police/i, "Versicherung"],
  [/abwasser|frischwasser|wasser|niederschlag/i, "Wasser & Abwasser"],
  [/strom|gas|energie|heiz|tibber|maingau|evd|eva[ _-]/i, "Energie"],
  [/grundsteuer|müll|muell|gebühr|gebuehr|schornstein/i, "Grundsteuer & Gebühren"],
  [/renovier|handwerk|sanierung|reparatur|rechnung.*(maler|fliesen|elektro|sanitär)|bauhaus|hagebau|toom|obi/i, "Instandhaltung & Renovierung"],
  [/weg|hausgeld|eigentümerversammlung|jahresabrechnung|betriebskostenabrechnung/i, "WEG"],
  [/mietvertrag/i, "Mietvertrag"],
  [/übergabe|uebergabe/i, "Übergabeprotokoll"],
  [/perso|ausweis|entgelt|gehalt|lohn|verdienst|schufa|selbstauskunft/i, "Bewerbung & Bonität"],
];

export function suggestTag(filename: string): DocumentTag | null {
  for (const [re, tag] of RULES) if (re.test(filename)) return tag;
  return null;
}

const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Anzeigename aus dem Dateinamen: Trenner zu Leerzeichen, Datum ans Ende in Klammern
// („20251110_Bauhaus.pdf" → „Bauhaus (10.11.2025)", „2025_Frischwasser_Hörstein.pdf" →
// „Frischwasser Hörstein 2025"). Übergabeprotokolle bekommen den Namen des Mieters.
export function suggestTitle(filename: string, opts: { tag?: string | null; personName?: string | null } = {}): string {
  let base = filename.replace(/\.[^.]+$/, "").normalize("NFC");
  let suffix = "";
  const full = base.match(/^(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?=[^0-9]|$)[-_ .]*/);
  if (full) {
    suffix = ` (${full[3]}.${full[2]}.${full[1]})`;
    base = base.slice(full[0].length);
  } else {
    const ym = base.match(/^(20\d{2})[-_.](0[1-9]|1[0-2])(?=[^0-9]|$)[-_ .]*/);
    const y = base.match(/^((?:19|20)\d{2}(?:-(?:19|20)\d{2})?)(?=[^0-9]|$)[-_ .]*/);
    if (ym) {
      suffix = ` ${MONTHS_DE[+ym[2]! - 1]} ${ym[1]}`;
      base = base.slice(ym[0].length);
    } else if (y) {
      suffix = ` ${y[1]!.replace("-", "/")}`;
      base = base.slice(y[0].length);
    }
  }
  let words = base.replace(/[_]+/g, " ").replace(/\s+-\s+/g, " – ").replace(/\s+/g, " ").trim();
  if (opts.tag === "Übergabeprotokoll" && opts.personName && !words.toLowerCase().includes(opts.personName.split(" ").at(-1)!.toLowerCase())) {
    words = `${words || "Übergabeprotokoll"} ${opts.personName}`;
  }
  if (!words) words = opts.tag ?? "Dokument";
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${suffix}`;
}
