import type { EXPENSE_CATEGORIES } from "@/db/schema";

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  // Umlegbare Betriebskosten (§ 2 BetrKV)
  bk_grundsteuer:      "Grundsteuer",
  bk_wasser:           "Wasserversorgung",
  bk_abwasser:         "Entwässerung",
  bk_heizung:          "Heizung",
  bk_warmwasser:       "Warmwasser",
  bk_aufzug:           "Aufzug",
  bk_strasse_muell:    "Straßenreinigung & Müll",
  bk_hausreinigung:    "Hausreinigung",
  bk_gartenpflege:     "Gartenpflege",
  bk_beleuchtung:      "Allgemeinstrom",
  bk_schornsteinfeger: "Schornsteinreinigung",
  bk_versicherung:     "Sach-/Haftpflichtversicherung",
  bk_hauswart:         "Hauswart",
  bk_antenne_kabel:    "Antenne / Kabel",
  bk_waschkueche:      "Wascheinrichtung",
  bk_sonstige:         "Sonstige Betriebskosten",
  // Nicht umlegbar (nur Werbungskosten)
  maintenance:         "Erhaltungsaufwand",
  capital_expense:     "Herstellungs-/Anschaffungsnaher Aufwand",
  administration:      "Verwaltungskosten",
  insurance_owner:     "Vermieter-Versicherung",
  non_allocable_other: "Sonstige nicht umlegbare Kosten",
  other:               "Sonstige Werbungskosten",
  // WEG (Eigentumswohnung)
  weg_hausgeld:        "Hausgeld-Vorauszahlung (WEG)",
  weg_saldo:           "Saldo WEG-Jahresabrechnung",
  weg_ruecklage:       "Instandhaltungsrücklage",
};

// Liste aller umlegbaren Betriebskosten (§ 2 BetrKV)
export const OPERATING_COST_CATEGORIES: ExpenseCategory[] = [
  "bk_grundsteuer", "bk_wasser", "bk_abwasser", "bk_heizung", "bk_warmwasser",
  "bk_aufzug", "bk_strasse_muell", "bk_hausreinigung", "bk_gartenpflege",
  "bk_beleuchtung", "bk_schornsteinfeger", "bk_versicherung", "bk_hauswart",
  "bk_antenne_kabel", "bk_waschkueche", "bk_sonstige",
];

export function isOperatingCost(category: string): boolean {
  return (OPERATING_COST_CATEGORIES as string[]).includes(category);
}

// Kategorien, die einen typisch jährlichen Charakter haben und im Cashflow
// automatisch über 12 Monate verteilt werden, wenn keine explizite Periode angegeben ist.
const AUTO_YEARLY_CATEGORIES = new Set<string>(["bk_grundsteuer"]);

export function isAutoYearlyCategory(category: string): boolean {
  return AUTO_YEARLY_CATEGORIES.has(category);
}

// Kategorien, die in Anlage V als Werbungskosten ignoriert werden (nur Cashflow-Tracking).
const ANLAGE_V_IGNORED = new Set<string>(["weg_hausgeld", "weg_saldo", "weg_ruecklage"]);

export function isAnlageVRelevant(category: string): boolean {
  return !ANLAGE_V_IGNORED.has(category);
}

// Gruppierung für UI (z.B. Form-Dropdown mit optgroup)
export const CATEGORY_GROUPS: { label: string; categories: ExpenseCategory[] }[] = [
  {
    label: "Umlegbare Betriebskosten (§ 2 BetrKV)",
    categories: OPERATING_COST_CATEGORIES,
  },
  {
    label: "Nicht umlegbar (nur Werbungskosten)",
    categories: ["maintenance", "capital_expense", "administration", "insurance_owner", "non_allocable_other", "other"],
  },
  {
    label: "WEG / Eigentumswohnung",
    categories: ["weg_hausgeld", "weg_saldo", "weg_ruecklage"],
  },
];
