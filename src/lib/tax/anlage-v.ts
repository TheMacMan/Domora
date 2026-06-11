// Anlage-V-Berechnung (Einnahmen-Überschuss, Zufluss-Prinzip)
// Alle Beträge in Cents als INTEGER.

export type AnlageVEinnahmen = {
  mieteinnahmenCents: number;      // Ist-Mieten (paidAt im Jahr)
  umlagenCents: number;            // NK-Vorauszahlungen (paidAt im Jahr)
  sonstigeEinnahmenCents: number;  // reserviert, aktuell 0
  gesamtCents: number;
};

export type AnlageVWerbungskosten = {
  schuldzinsenCents: number;           // aus loan_payments (dueDate im Jahr)
  erhaltungsaufwandCents: number;      // expenses: maintenance
  kapitalaufwandCents: number;         // expenses: capital_expense
  afaCents: number;                    // 2 % linear vom Gebäudeanteil
  grundsteuerCents: number;            // expenses: bk_grundsteuer
  versicherungenCents: number;         // expenses: bk_versicherung + insurance_owner
  verwaltungskostenCents: number;      // expenses: administration
  betriebskostenCents: number;         // alle anderen bk_* (Wasser, Müll, Hausmeister …)
  nichtUmlegbareCents: number;         // expenses: non_allocable_other
  sonstigeCents: number;               // expenses: other
  gesamtCents: number;
};

export type AnlageVErgebnis = {
  propertyId: string;
  year: number;
  einnahmen: AnlageVEinnahmen;
  werbungskosten: AnlageVWerbungskosten;
  ueberschussCents: number; // positiv = Überschuss, negativ = Verlust
  // Leerstand-Anteil aus NK-Abrechnungen — rein informativ, keine Auswirkung auf Werbungskosten
  // (die Kosten waren ohnehin in voller Höhe in `werbungskosten` enthalten).
  leerstand: {
    gesamtCents: number;
    nachKategorieCents: Record<string, number>;
  };
};

export type AnlageVInput = {
  propertyId: string;
  year: number;
  // Immobiliendaten für AfA
  purchasePriceTotal: number | null;  // Cents
  purchasePriceLand: number | null;   // Cents
  depreciationPermille: number;       // z.B. 20 = 2,0 %
  // Zahlungseingänge: alle Payments mit paidAt im Jahr
  payments: Array<{
    paidCents: number | null;
    paidAt: string | null;
    rentCents: number;
    serviceChargesCents: number | null;
  }>;
  // Darlehensraten mit dueDate im Jahr (Schuldzinsen = Abflussprinzip bei Annuität)
  loanPayments: Array<{
    interestCents: number;
    dueDate: string;
  }>;
  // Ausgaben mit date im Jahr
  expenses: Array<{
    category: string;
    amountCents: number;
  }>;
  // Leerstand-Anteile aus NK-Abrechnungen, pro Kategorie (informativ).
  vacancyByCategory?: Record<string, number>;
  vacancyTotal?: number;
};

export function calcAfA(
  purchasePriceTotal: number | null,
  purchasePriceLand: number | null,
  depreciationPermille: number,
): number {
  if (purchasePriceTotal == null) return 0;
  const buildingValue = purchasePriceTotal - (purchasePriceLand ?? 0);
  if (buildingValue <= 0) return 0;
  return Math.round(buildingValue * depreciationPermille / 1000);
}

export function calcAnlageV(input: AnlageVInput): AnlageVErgebnis {
  // Einnahmen (Zufluss-Prinzip: paidAt im Jahr)
  const paidInYear = input.payments.filter(
    (p) => p.paidAt?.startsWith(String(input.year))
  );

  // Aufteilung Kaltmiete / NK aus Soll-Verhältnis
  let mietanteilCents = 0;
  let umlagenanteilCents = 0;
  for (const p of paidInYear) {
    const paid = p.paidCents ?? (p.rentCents + (p.serviceChargesCents ?? 0));
    const soll = p.rentCents + (p.serviceChargesCents ?? 0);
    if (soll === 0) continue;
    const ratio = paid / soll;
    mietanteilCents += Math.round(p.rentCents * ratio);
    umlagenanteilCents += Math.round((p.serviceChargesCents ?? 0) * ratio);
  }

  const einnahmen: AnlageVEinnahmen = {
    mieteinnahmenCents: mietanteilCents,
    umlagenCents: umlagenanteilCents,
    sonstigeEinnahmenCents: 0,
    gesamtCents: mietanteilCents + umlagenanteilCents,
  };

  // Werbungskosten
  const schuldzinsenCents = input.loanPayments
    .filter((lp) => lp.dueDate.startsWith(String(input.year)))
    .reduce((s, lp) => s + lp.interestCents, 0);

  // WEG-Cashflow-Kategorien sind KEINE Werbungskosten — sie werden über die
  // Einzelposten der WEG-Abrechnung erfasst, die schon korrekt kategorisiert sind.
  const ANLAGE_V_IGNORED = new Set(["weg_hausgeld", "weg_saldo", "weg_ruecklage"]);

  function sumCategory(cat: string) {
    if (ANLAGE_V_IGNORED.has(cat)) return 0;
    return input.expenses
      .filter((e) => e.category === cat)
      .reduce((s, e) => s + e.amountCents, 0);
  }

  const afaCents = calcAfA(
    input.purchasePriceTotal,
    input.purchasePriceLand,
    input.depreciationPermille,
  );

  // Sonstige Betriebskosten = alle bk_* außer Grundsteuer und Versicherung
  const otherBkCats = [
    "bk_wasser", "bk_abwasser", "bk_heizung", "bk_warmwasser", "bk_aufzug",
    "bk_strasse_muell", "bk_hausreinigung", "bk_gartenpflege", "bk_beleuchtung",
    "bk_schornsteinfeger", "bk_hauswart", "bk_antenne_kabel", "bk_waschkueche", "bk_sonstige",
  ];
  const betriebskostenCents = otherBkCats.reduce((s, c) => s + sumCategory(c), 0);

  const werbungskosten: AnlageVWerbungskosten = {
    schuldzinsenCents,
    erhaltungsaufwandCents: sumCategory("maintenance"),
    kapitalaufwandCents:    sumCategory("capital_expense"),
    afaCents,
    grundsteuerCents:       sumCategory("bk_grundsteuer"),
    versicherungenCents:    sumCategory("bk_versicherung") + sumCategory("insurance_owner"),
    verwaltungskostenCents: sumCategory("administration"),
    betriebskostenCents,
    nichtUmlegbareCents:    sumCategory("non_allocable_other"),
    sonstigeCents:          sumCategory("other"),
    gesamtCents: 0,
  };

  werbungskosten.gesamtCents =
    werbungskosten.schuldzinsenCents +
    werbungskosten.erhaltungsaufwandCents +
    werbungskosten.kapitalaufwandCents +
    werbungskosten.afaCents +
    werbungskosten.grundsteuerCents +
    werbungskosten.versicherungenCents +
    werbungskosten.verwaltungskostenCents +
    werbungskosten.betriebskostenCents +
    werbungskosten.nichtUmlegbareCents +
    werbungskosten.sonstigeCents;

  return {
    propertyId: input.propertyId,
    year: input.year,
    einnahmen,
    werbungskosten,
    ueberschussCents: einnahmen.gesamtCents - werbungskosten.gesamtCents,
    leerstand: {
      gesamtCents: input.vacancyTotal ?? 0,
      nachKategorieCents: input.vacancyByCategory ?? {},
    },
  };
}
