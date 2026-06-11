import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { CATEGORY_LABELS } from "@/lib/expense";
import { DISTRIBUTION_LABELS } from "@/lib/nk-abrechnung";
import { formatDateObj } from "@/lib/dates";

const s = StyleSheet.create({
  page:        { fontSize: 9, padding: 40, color: "#111" },
  watermark:   { position: "absolute", top: "42%", left: 0, right: 0, textAlign: "center", fontSize: 110, color: "#f3f3f3", transform: "rotate(-28deg)", fontWeight: 700, letterSpacing: 6 },
  headerRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  block:       { fontSize: 8.5, lineHeight: 1.4 },
  title:       { fontSize: 16, fontWeight: 700, marginTop: 8, marginBottom: 2 },
  subtitle:    { fontSize: 9, color: "#666", marginBottom: 16 },
  metaRow:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  metaBlock:   { flex: 1 },
  metaLabel:   { fontSize: 7.5, color: "#777", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  section:     { marginBottom: 14 },
  sectionHdr:  { fontSize: 10, fontWeight: 700, borderBottomWidth: 1, borderBottomColor: "#ddd", paddingBottom: 3, marginBottom: 6 },
  tableHead:   { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 4, marginBottom: 3 },
  th:          { fontSize: 7.5, fontWeight: 700, color: "#555", textTransform: "uppercase" },
  thLabel:     { flex: 2.2, paddingRight: 6 },
  thAmount:    { width: 78, textAlign: "right", paddingRight: 6 },
  thAmountLast:{ width: 78, textAlign: "right" },
  thKey:       { width: 72, paddingRight: 6 },
  thBasis:     { flex: 1.8, paddingRight: 6 },
  row:         { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  td:          { fontSize: 9 },
  tdLabel:     { flex: 2.2, paddingRight: 6 },
  tdAmount:    { width: 78, textAlign: "right", paddingRight: 6 },
  tdAmountLast:{ width: 78, textAlign: "right" },
  tdKey:       { width: 72, color: "#666", paddingRight: 6 },
  tdBasis:     { flex: 1.8, color: "#666", fontSize: 8, paddingRight: 6 },
  totalRow:    { flexDirection: "row", paddingVertical: 5, borderTopWidth: 1, borderTopColor: "#333", marginTop: 4, fontWeight: 700 },
  resultBox:   { marginTop: 16, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 4 },
  resultRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  resultLbl:   { fontSize: 10 },
  resultAmt:   { fontSize: 10, textAlign: "right", width: 110 },
  saldoRow:    { flexDirection: "row", justifyContent: "space-between", paddingTop: 7, marginTop: 5, borderTopWidth: 1, borderTopColor: "#333" },
  saldoLbl:    { fontSize: 12, fontWeight: 700 },
  saldoAmt:    { fontSize: 12, fontWeight: 700, textAlign: "right", width: 110 },
  hintBox:     { marginTop: 18, padding: 12, backgroundColor: "#fafafa", borderRadius: 4, borderLeftWidth: 3, borderLeftColor: "#bbb" },
  hint:        { fontSize: 8, color: "#555", lineHeight: 1.5 },
  hintTitle:   { fontSize: 8.5, fontWeight: 700, marginBottom: 4, color: "#333" },
  footer:      { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 7, color: "#999", textAlign: "center" },
});

function fmt(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export type NkPdfInput = {
  landlord: {
    name: string | null;
    address: string | null;
    postalCode: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
    iban: string | null;
    bic: string | null;
    bank: string | null;
  };
  property: { street: string; postalCode: string; city: string };
  unit: { name: string };
  tenants: string[];
  year: number;
  monthsActive: number;
  monthsLabel: string;             // z.B. "01.01.2025 – 31.12.2025" oder Teilzeitraum
  positionen: Array<{
    category: string;
    totalCostsCents: number;
    distributionKey: string;
    basisLabel: string | null;
    shareCents: number;
  }>;
  kostenAnteilCents: number;
  vorauszahlungenCents: number;
  saldoCents: number;
  isDraft: boolean;
};

export function NkAbrechnungPdf(input: NkPdfInput) {
  const { landlord, property, unit, tenants, year, monthsActive, monthsLabel, positionen, kostenAnteilCents, vorauszahlungenCents, saldoCents, isDraft } = input;

  const saldoLabel = saldoCents > 0 ? "Nachzahlung" : saldoCents < 0 ? "Erstattung" : "Ausgeglichen";
  const tenantLine = tenants.join(" · ") || "—";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {isDraft && <Text style={s.watermark}>ENTWURF</Text>}

        {/* Kopf */}
        <View style={s.headerRow}>
          <View style={s.block}>
            <Text style={{ fontWeight: 700 }}>{landlord.name ?? "[Vermieter]"}</Text>
            <Text>{landlord.address ?? "—"}</Text>
            <Text>{[landlord.postalCode, landlord.city].filter(Boolean).join(" ") || "—"}</Text>
            {landlord.email && <Text>{landlord.email}</Text>}
            {landlord.phone && <Text>{landlord.phone}</Text>}
          </View>
          <View style={[s.block, { textAlign: "right" }]}>
            <Text style={{ fontWeight: 700 }}>Mieter:</Text>
            <Text>{tenantLine}</Text>
            <Text>{property.street}</Text>
            <Text>{property.postalCode} {property.city}</Text>
            <Text>Wohneinheit: {unit.name}</Text>
          </View>
        </View>

        <Text style={s.title}>Nebenkostenabrechnung {year}</Text>
        <Text style={s.subtitle}>Erstellt am {formatDateObj(new Date())}</Text>

        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Abrechnungszeitraum</Text>
            <Text>{monthsLabel}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Aktive Monate</Text>
            <Text>{monthsActive} / 12</Text>
          </View>
        </View>

        {/* Positionen */}
        <View style={s.section}>
          <Text style={s.sectionHdr}>Positionen</Text>
          <View style={s.tableHead}>
            <Text style={[s.th, s.thLabel]}>Kategorie</Text>
            <Text style={[s.th, s.thAmount]}>Gesamtkosten</Text>
            <Text style={[s.th, s.thKey]}>Schlüssel</Text>
            <Text style={[s.th, s.thBasis]}>Basis</Text>
            <Text style={[s.th, s.thAmountLast]}>Ihr Anteil</Text>
          </View>
          {positionen.map((p, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.td, s.tdLabel]}>
                {CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category}
              </Text>
              <Text style={[s.td, s.tdAmount]}>{fmt(p.totalCostsCents)}</Text>
              <Text style={[s.td, s.tdKey]}>{DISTRIBUTION_LABELS[p.distributionKey as keyof typeof DISTRIBUTION_LABELS] ?? p.distributionKey}</Text>
              <Text style={[s.td, s.tdBasis]}>{p.basisLabel ?? "—"}</Text>
              <Text style={[s.td, s.tdAmountLast, { fontWeight: 700 }]}>{fmt(p.shareCents)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.td, s.tdLabel, { fontWeight: 700 }]}>Summe Kosten</Text>
            <Text style={[s.td, s.tdAmount]}></Text>
            <Text style={[s.td, s.tdKey]}></Text>
            <Text style={[s.td, s.tdBasis]}></Text>
            <Text style={[s.td, s.tdAmountLast, { fontWeight: 700 }]}>{fmt(kostenAnteilCents)}</Text>
          </View>
        </View>

        {/* Abrechnung */}
        <View style={s.resultBox}>
          <View style={s.resultRow}>
            <Text style={s.resultLbl}>Kostenanteil</Text>
            <Text style={s.resultAmt}>{fmt(kostenAnteilCents)}</Text>
          </View>
          <View style={s.resultRow}>
            <Text style={s.resultLbl}>./. Geleistete Vorauszahlungen</Text>
            <Text style={s.resultAmt}>{fmt(vorauszahlungenCents)}</Text>
          </View>
          <View style={s.saldoRow}>
            <Text style={s.saldoLbl}>{saldoLabel}</Text>
            <Text style={s.saldoAmt}>{fmt(Math.abs(saldoCents))}</Text>
          </View>
        </View>

        {/* Hinweis zur Nachzahlung — nur wenn Nachzahlung anfällt und Bankverbindung gepflegt */}
        {saldoCents > 0 && landlord.iban && (
          <View style={s.hintBox}>
            <Text style={s.hint}>
              Bitte überweisen Sie die Nachzahlung auf folgende Bankverbindung: IBAN {landlord.iban}
              {landlord.bic ? `, BIC ${landlord.bic}` : ""}
              {landlord.bank ? `, ${landlord.bank}` : ""}.
            </Text>
          </View>
        )}

        <Text style={s.footer}>Erstellt mit Domora · {formatDateObj(new Date())}</Text>
      </Page>
    </Document>
  );
}
