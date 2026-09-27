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
  [/zins|darlehen|kredit|tilgung|bauspar/i, "Darlehen & Zinsen"],
  [/este|steuer(?!n?ummer)|anlage[ _-]?v|bescheid.*finanzamt|elster/i, "Steuer"],
  [/versicherung|police/i, "Versicherung"],
  [/abwasser|frischwasser|wasser|niederschlag/i, "Wasser & Abwasser"],
  [/strom|gas|energie|heiz|tibber|maingau|evd|eva[ _-]/i, "Energie"],
  [/grundsteuer|müll|muell|gebühr|gebuehr|schornstein/i, "Grundsteuer & Gebühren"],
  [/renovier|handwerk|sanierung|rechnung.*(maler|fliesen|elektro|sanitär)/i, "Handwerker & Renovierung"],
  [/weg|hausgeld|eigentümerversammlung|jahresabrechnung|betriebskostenabrechnung/i, "WEG"],
  [/mietvertrag/i, "Mietvertrag"],
  [/übergabe|uebergabe/i, "Übergabeprotokoll"],
  [/perso|ausweis/i, "Personalausweis"],
  [/entgelt|gehalt|lohn|verdienst/i, "Verdienstnachweis"],
  [/schufa/i, "SCHUFA"],
];

export function suggestTag(filename: string): DocumentTag | null {
  for (const [re, tag] of RULES) if (re.test(filename)) return tag;
  return null;
}
