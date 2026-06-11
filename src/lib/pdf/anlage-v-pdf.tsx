import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { AnlageVErgebnis } from "@/lib/tax/anlage-v";
import { formatDateObj } from "@/lib/dates";

const s = StyleSheet.create({
  page:       { fontSize: 9, padding: 40, color: "#111" },
  title:      { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle:   { fontSize: 10, color: "#555", marginBottom: 20 },
  section:    { marginBottom: 14 },
  sectionHdr: { fontSize: 10, fontWeight: 700, borderBottomWidth: 1, borderBottomColor: "#ddd", paddingBottom: 3, marginBottom: 6 },
  row:        { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  rowAlt:     { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, backgroundColor: "#f5f5f5" },
  totalRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1, borderTopColor: "#333", marginTop: 2 },
  label:      { flex: 1 },
  amount:     { width: 90, textAlign: "right" },
  amountBold: { width: 90, textAlign: "right", fontWeight: 700 },
  resultBox:  { marginTop: 20, padding: 10, backgroundColor: "#f0f0f0", borderRadius: 4 },
  resultRow:  { flexDirection: "row", justifyContent: "space-between" },
  resultLbl:  { fontSize: 11, fontWeight: 700 },
  resultAmt:  { fontSize: 11, fontWeight: 700, textAlign: "right" },
  footer:     { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 7, color: "#999", textAlign: "center" },
});

function fmt(cents: number) {
  const eur = cents / 100;
  return eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

type Row = { label: string; cents: number; alt?: boolean };

function TableRows({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <View key={i} style={r.alt ? s.rowAlt : s.row}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.amount}>{r.cents !== 0 ? fmt(r.cents) : "–"}</Text>
        </View>
      ))}
    </>
  );
}

type Props = {
  ergebnis: AnlageVErgebnis;
  propertyAddress: string;
};

export function AnlageVPdf({ ergebnis, propertyAddress }: Props) {
  const { einnahmen: e, werbungskosten: w } = ergebnis;
  const isVerlust = ergebnis.ueberschussCents < 0;

  const einnahmenRows: Row[] = [
    { label: "Mieteinnahmen (Kaltmiete)", cents: e.mieteinnahmenCents },
    { label: "Umlagen / NK-Vorauszahlungen", cents: e.umlagenCents, alt: true },
    { label: "Sonstige Einnahmen", cents: e.sonstigeEinnahmenCents },
  ];

  const wkRows: Row[] = [
    { label: "Schuldzinsen", cents: w.schuldzinsenCents },
    { label: "Absetzung für Abnutzung (AfA)", cents: w.afaCents, alt: true },
    { label: "Erhaltungsaufwand", cents: w.erhaltungsaufwandCents },
    { label: "Herstellungs-/Anschaffungsnaher Aufwand", cents: w.kapitalaufwandCents, alt: true },
    { label: "Grundsteuer", cents: w.grundsteuerCents },
    { label: "Sach-/Haftpflichtversicherung", cents: w.versicherungenCents, alt: true },
    { label: "Verwaltungskosten", cents: w.verwaltungskostenCents },
    { label: "Übrige Betriebskosten (umlegbar)", cents: w.betriebskostenCents, alt: true },
    { label: "Nicht umlegbare Kosten", cents: w.nichtUmlegbareCents },
    { label: "Sonstige Werbungskosten", cents: w.sonstigeCents, alt: true },
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Anlage V – {ergebnis.year}</Text>
        <Text style={s.subtitle}>{propertyAddress}</Text>

        {/* Einnahmen */}
        <View style={s.section}>
          <Text style={s.sectionHdr}>Einnahmen</Text>
          <TableRows rows={einnahmenRows} />
          <View style={s.totalRow}>
            <Text style={s.label}>Einnahmen gesamt</Text>
            <Text style={s.amountBold}>{fmt(e.gesamtCents)}</Text>
          </View>
        </View>

        {/* Werbungskosten */}
        <View style={s.section}>
          <Text style={s.sectionHdr}>Werbungskosten</Text>
          <TableRows rows={wkRows} />
          <View style={s.totalRow}>
            <Text style={s.label}>Werbungskosten gesamt</Text>
            <Text style={s.amountBold}>{fmt(w.gesamtCents)}</Text>
          </View>
          {ergebnis.leerstand.gesamtCents > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 4, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 8, color: "#666", fontStyle: "italic" }}>
                davon Leerstand-Anteil (nicht auf Mieter umgelegt)
              </Text>
              <Text style={{ fontSize: 8, color: "#666", fontStyle: "italic" }}>
                {fmt(ergebnis.leerstand.gesamtCents)}
              </Text>
            </View>
          )}
        </View>

        {/* Ergebnis */}
        <View style={s.resultBox}>
          <View style={s.resultRow}>
            <Text style={s.resultLbl}>
              {isVerlust ? "Werbungskostenüberschuss (Verlust)" : "Überschuss der Einnahmen"}
            </Text>
            <Text style={s.resultAmt}>{fmt(Math.abs(ergebnis.ueberschussCents))}</Text>
          </View>
        </View>

        <Text style={s.footer}>
          Erstellt mit Domora · {formatDateObj(new Date())} · Keine steuerliche Beratung
        </Text>
      </Page>
    </Document>
  );
}
