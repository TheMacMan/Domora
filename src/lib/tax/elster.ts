// Aufbereitung der Anlage V in der Zeilenstruktur des ELSTER-Formulars
// (Zeilennummern wie Anlage V 2024/2025). Reine Funktion, alle Beträge in Cents.
//
// ELSTER erwartet volle Euro: Einnahmen werden abgerundet, Werbungskosten
// aufgerundet (je Eintrag, zugunsten des Steuerpflichtigen — so rechnet auch DATEV).

export type ElsterItem = { date: string | null; label: string; cents: number };

export type ElsterEntry = {
  zeile: string;
  label: string;          // Bezeichnung / Einzelangabe, wie in ELSTER einzutragen
  hint?: string;          // Zusatzinfo (z. B. AfA-Art, Erläuterung)
  cents: number;          // exakter Betrag
  euro: number;           // in ELSTER einzutragender Wert (volle Euro)
  items?: ElsterItem[];   // Einzelbelege hinter dem Eintrag
};

export type ElsterSection = {
  title: string;
  entries: ElsterEntry[];
  sum?: { zeile: string; label: string; cents: number; euro: number };
};

export type ElsterWarning = { zeile?: string; text: string };

export type ElsterAnlageV = {
  year: number;
  allgemein: Array<{ zeile: string; label: string; value: string }>;
  einnahmen: ElsterSection[];
  werbungskosten: ElsterSection[];
  summeEinnahmen: { cents: number; euro: number };   // Zeile 32
  summeWerbungskosten: { cents: number; euro: number }; // Zeile 83
  ueberschuss: { cents: number; euro: number };      // Zeile 85
  warnings: ElsterWarning[];
};

export type ElsterInput = {
  year: number;
  property: { street: string; postalCode: string; city: string; purchaseDate: string | null };
  // Kaltmiete je Wohneinheit (Zufluss im Jahr)
  rentByUnit: Array<{ unitName: string; cents: number }>;
  umlagenLaufendCents: number;     // Zeile 20: laufende NK-Vorauszahlungen / -Pauschalen
  nkAbrechnungCents: number;       // Zeile 21: im Jahr erhaltene Nachzahlungen / geleistete Erstattungen
  afaItems: Array<{
    method: "linear" | "degressive";
    rateBps: number | null;
    basisMode: "prior_year" | "explanation";
    explanation: string | null;
    annualCents: number;
  }>;
  afaFallbackCents: number | null; // AfA ohne Posten (aus Kaufpreis berechnet); null = keine
  loans: Array<{ label: string; interestCents: number }>;
  expenses: Array<{ category: string; cents: number; date: string | null; description: string | null }>;
};

// Umgelegte Kosten (Zeile 73) — Bezeichnungen wie im ELSTER-Formular
const UMGELEGT_LABEL: Record<string, string> = {
  bk_grundsteuer: "Grundsteuer",
  bk_wasser: "Wasserversorgung",
  bk_abwasser: "Entwässerung",
  bk_heizung: "Heizung",
  bk_warmwasser: "Warmwasser",
  bk_aufzug: "Fahrstuhl",
  bk_strasse_muell: "Straßenreinigung / Müllabfuhr",
  bk_hausreinigung: "Treppenhausreinigung",
  bk_gartenpflege: "Gartenpflege",
  bk_beleuchtung: "Hausbeleuchtung",
  bk_schornsteinfeger: "Schornsteinreinigung",
  bk_versicherung: "Hausversicherungen",
  bk_hauswart: "Hauswart",
  bk_antenne_kabel: "Antenne / Kabel",
  bk_waschkueche: "Gemeinschaftswaschküche",
  bk_sonstige: "Sonstige Betriebskosten",
};

// Kategorien ohne Werbungskosten-Wirkung (WEG-Cashflow)
const IGNORED = new Set(["weg_hausgeld", "weg_saldo", "weg_ruecklage"]);

export function euroIncome(cents: number): number {
  return Math.floor(cents / 100);
}

export function euroExpense(cents: number): number {
  return Math.ceil(cents / 100);
}

function incomeEntry(zeile: string, label: string, cents: number, extra?: Partial<ElsterEntry>): ElsterEntry {
  return { zeile, label, cents, euro: euroIncome(cents), ...extra };
}

function expenseEntry(zeile: string, label: string, cents: number, extra?: Partial<ElsterEntry>): ElsterEntry {
  return { zeile, label, cents, euro: euroExpense(cents), ...extra };
}

function sumOf(entries: ElsterEntry[]) {
  return {
    cents: entries.reduce((s, e) => s + e.cents, 0),
    euro: entries.reduce((s, e) => s + e.euro, 0),
  };
}

function toItems(rows: ElsterInput["expenses"]): ElsterItem[] {
  return [...rows]
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((r) => ({ date: r.date, label: r.description ?? "(ohne Beschreibung)", cents: r.cents }));
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Nicht umgelegte Kosten (Zeile 76) in sinnvolle Einzelangaben gruppieren
function nichtUmgelegtGroup(e: ElsterInput["expenses"][number]): string {
  if (e.category === "administration") return "Verwaltungskosten";
  if (e.category === "insurance_owner") return "Versicherungen (nicht umlegbar)";
  if (e.category === "non_allocable_other") return "Nicht umlegbare Betriebskosten (z. B. Leerstand)";
  const d = e.description ?? "";
  if (/^Fahrtkosten/i.test(d)) return "Fahrtkosten";
  if (/Kontoauszugspreis|Jahresentgelt|Kontoführung/i.test(d)) return "Kontoführungs- und Darlehensgebühren";
  return "Sonstige Werbungskosten";
}

export function buildElsterAnlageV(input: ElsterInput): ElsterAnlageV {
  const warnings: ElsterWarning[] = [];

  // ── Allgemeine Angaben ──
  const allgemein = [
    { zeile: "4", label: "Straße, Hausnummer", value: input.property.street },
    { zeile: "5", label: "Postleitzahl, Ort", value: `${input.property.postalCode} ${input.property.city}` },
  ];
  if (input.property.purchaseDate) {
    allgemein.push({ zeile: "7", label: "Angeschafft am", value: formatDate(input.property.purchaseDate) });
  }

  // ── Einnahmen ──
  const mietEntries = input.rentByUnit
    .filter((u) => u.cents !== 0)
    .map((u) => incomeEntry("13", u.unitName, u.cents));
  const mieten: ElsterSection = {
    title: "Mieteinnahmen für Wohnungen (ohne Umlagen)",
    entries: mietEntries,
    sum: { zeile: "15", label: "Summe", ...sumOf(mietEntries) },
  };
  const umlagen: ElsterSection = {
    title: "Einnahmen aus umgelegten Neben- / Betriebskosten",
    entries: [
      incomeEntry("20", "Laufende Neben- / Betriebskosten (Vorauszahlungen, Pauschalen)", input.umlagenLaufendCents),
      incomeEntry("21", "Im Jahr erhaltene Nachzahlungen / geleistete Erstattungen", input.nkAbrechnungCents, {
        hint: "Negativer Betrag = Erstattungen überwiegen (mit Minuszeichen eintragen)",
      }),
    ],
  };
  const einnahmenAll = [...mietEntries, ...umlagen.entries];
  const summeEinnahmen = sumOf(einnahmenAll);

  // ── Werbungskosten ──
  const afaEntries: ElsterEntry[] = input.afaItems.length > 0
    ? input.afaItems.map((i) => {
        const art = i.method === "degressive" ? "degressiv" : "linear";
        const prozent = i.rateBps != null ? `${(i.rateBps / 100).toLocaleString("de-DE")} %` : null;
        const basis = i.basisMode === "prior_year" ? "wie Vorjahr" : "laut Erläuterung";
        return expenseEntry("33", `AfA ${art}${prozent ? ` ${prozent}` : ""} – ${basis}`, i.annualCents, {
          hint: i.explanation ?? undefined,
        });
      })
    : input.afaFallbackCents
      ? [expenseEntry("33", "AfA linear – aus Anschaffungskosten berechnet", input.afaFallbackCents)]
      : [];
  const afa: ElsterSection = {
    title: "Absetzung für Abnutzung (AfA) für Gebäude",
    entries: afaEntries,
    sum: { zeile: "35", label: "Summe AfA", ...sumOf(afaEntries) },
  };

  const zinsEntries = input.loans
    .filter((l) => l.interestCents !== 0)
    .map((l) => expenseEntry("46", l.label, l.interestCents));
  const zinsen: ElsterSection = {
    title: "Schuldzinsen (ohne Tilgung)",
    entries: zinsEntries,
    sum: { zeile: "48", label: "Summe Schuldzinsen", ...sumOf(zinsEntries) },
  };

  const exp = input.expenses.filter((e) => !IGNORED.has(e.category) && e.cents !== 0);

  const maintenance = exp.filter((e) => e.category === "maintenance");
  const erhaltungEntries = maintenance.length > 0
    ? [expenseEntry("55", "Erhaltungsaufwendungen lt. Aufstellung", maintenance.reduce((s, e) => s + e.cents, 0), {
        items: toItems(maintenance),
      })]
    : [];
  const erhaltung: ElsterSection = {
    title: "Voll abzuziehende Erhaltungsaufwendungen",
    entries: erhaltungEntries,
  };

  const umgelegtEntries = Object.entries(UMGELEGT_LABEL)
    .map(([cat, label]) => {
      const rows = exp.filter((e) => e.category === cat);
      if (rows.length === 0) return null;
      return expenseEntry("73", label, rows.reduce((s, e) => s + e.cents, 0), { items: toItems(rows) });
    })
    .filter((e): e is ElsterEntry => e !== null && e.cents !== 0);
  const umgelegt: ElsterSection = {
    title: "Umgelegte Kosten (Betriebskosten)",
    entries: umgelegtEntries,
    sum: { zeile: "75", label: "Summe umgelegte Kosten", ...sumOf(umgelegtEntries) },
  };

  const nichtUmgelegtCats = new Set(["administration", "insurance_owner", "non_allocable_other", "other"]);
  const groups = new Map<string, ElsterInput["expenses"]>();
  for (const e of exp.filter((x) => nichtUmgelegtCats.has(x.category))) {
    const g = nichtUmgelegtGroup(e);
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  const nichtUmgelegtEntries = [...groups.entries()]
    .map(([label, rows]) => expenseEntry("76", label, rows.reduce((s, e) => s + e.cents, 0), { items: toItems(rows) }))
    .filter((e) => e.cents !== 0);
  const nichtUmgelegt: ElsterSection = {
    title: "Nicht umgelegte Kosten",
    entries: nichtUmgelegtEntries,
    sum: { zeile: "78", label: "Summe nicht umgelegte Kosten", ...sumOf(nichtUmgelegtEntries) },
  };

  // Herstellungs-/anschaffungsnaher Aufwand ist nicht sofort abziehbar → nur Hinweis
  const capital = exp.filter((e) => e.category === "capital_expense");
  if (capital.length > 0) {
    const total = capital.reduce((s, e) => s + e.cents, 0);
    warnings.push({
      text: `Herstellungs-/anschaffungsnaher Aufwand von ${(total / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} ist nicht als Werbungskosten abziehbar und daher nicht enthalten — er erhöht die AfA-Bemessungsgrundlage.`,
    });
  }

  const unknown = exp.filter(
    (e) => e.category !== "maintenance" && e.category !== "capital_expense" &&
      !(e.category in UMGELEGT_LABEL) && !nichtUmgelegtCats.has(e.category),
  );
  if (unknown.length > 0) {
    warnings.push({ text: `${unknown.length} Ausgabe(n) mit unbekannter Kategorie wurden nicht zugeordnet.` });
  }

  const wkAll = [...afaEntries, ...zinsEntries, ...erhaltungEntries, ...umgelegtEntries, ...nichtUmgelegtEntries];
  const summeWerbungskosten = sumOf(wkAll);

  if (mietEntries.length > 0) {
    warnings.push({
      zeile: "26",
      text: "Garagen- und Stellplatzmieten sind in Zeile 13 enthalten. Wurden sie separat vereinbart, können sie stattdessen in Zeile 26 eingetragen werden — die Summe der Einnahmen ändert sich dadurch nicht.",
    });
  }

  return {
    year: input.year,
    allgemein,
    einnahmen: [mieten, umlagen],
    werbungskosten: [afa, zinsen, erhaltung, umgelegt, nichtUmgelegt],
    summeEinnahmen,
    summeWerbungskosten,
    ueberschuss: {
      cents: summeEinnahmen.cents - summeWerbungskosten.cents,
      euro: summeEinnahmen.euro - summeWerbungskosten.euro,
    },
    warnings,
  };
}
