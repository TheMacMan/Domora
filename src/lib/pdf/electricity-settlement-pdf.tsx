import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { BillingLine } from "@/lib/meter-billing";

const s = StyleSheet.create({
  page: { fontSize: 9, padding: 40, color: "#111" },
  sender: { fontSize: 7.5, color: "#666", marginBottom: 4 },
  addr: { marginBottom: 24, lineHeight: 1.4 },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  meta: { flexDirection: "row", gap: 16, color: "#555", marginBottom: 16 },
  hdr: { flexDirection: "row", paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#333", fontWeight: 700 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5" },
  meter: { flex: 1, paddingRight: 4 },
  period: { width: 110 },
  num: { width: 58, textAlign: "right" },
  total: { flexDirection: "row", paddingTop: 6, fontWeight: 700, fontSize: 10 },
  note: { marginTop: 14, color: "#444", lineHeight: 1.4 },
  small: { marginTop: 4, fontSize: 7.5, color: "#666" },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, fontSize: 7, color: "#999", textAlign: "center" },
});

const eur = (c: number) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (n: number, d = 1) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: 3 });
const d = (iso: string) => iso.split("-").reverse().join(".");
function dayBefore(iso: string) {
  return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) - 1)).toISOString().slice(0, 10);
}

export type SettlementPdfData = {
  direction: "refund" | "charge";
  number: string;
  date: string;
  landlord: { name: string; address: string; iban: string | null; bank: string | null };
  recipient: { names: string; unit: string; address: string };
  periodStart: string;
  periodEnd: string;
  lines: BillingLine[];
  kwh: number;
  cents: number;
  estimateNotes: string[];
};

// Stromerstattung (an den Mieter mit dem Stromvertrag) bzw. Stromabrechnung (an den Verbraucher)
export function ElectricitySettlementPdf({ data }: { data: SettlementPdfData }): React.ReactElement<DocumentProps> {
  const refund = data.direction === "refund";
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.sender}>{data.landlord.name} · {data.landlord.address}</Text>
        <View style={s.addr}>
          <Text>{data.recipient.names}</Text>
          <Text>{data.recipient.address}</Text>
          <Text>{data.recipient.unit}</Text>
        </View>
        <Text style={s.title}>{refund ? "Stromerstattung Zwischenzähler" : "Stromabrechnung nach Verbrauch"}</Text>
        <View style={s.meta}>
          <Text>Nr. {data.number}</Text>
          <Text>Datum {d(data.date)}</Text>
          <Text>Zeitraum {d(data.periodStart)} – {d(dayBefore(data.periodEnd))}</Text>
        </View>
        <Text style={{ marginBottom: 10, lineHeight: 1.4 }}>
          {refund
            ? "Über Ihren Stromanschluss wird Strom verbraucht, der nicht Ihrer Wohnung zuzurechnen ist. Diesen erstatten wir Ihnen nach Zählerstand zu Ihrem Arbeitspreis:"
            : "Der Strom Ihrer Wohnung wird über einen Zwischenzähler erfasst. Für den Abrechnungszeitraum ergibt sich folgender Verbrauch:"}
        </Text>
        <View style={s.hdr}>
          <Text style={s.meter}>Zähler</Text>
          <Text style={s.period}>Zeitraum</Text>
          <Text style={s.num}>Stand Beginn</Text>
          <Text style={s.num}>Stand Ende</Text>
          <Text style={s.num}>kWh</Text>
          <Text style={s.num}>ct/kWh</Text>
          <Text style={s.num}>Betrag</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.meter}>{l.meterName}{l.estimated ? " (Schätzung)" : ""}{l.interpolated ? " *" : ""}</Text>
            <Text style={s.period}>{d(l.from)} – {d(dayBefore(l.to))}</Text>
            <Text style={s.num}>{l.startValue != null ? num(l.startValue) : "–"}</Text>
            <Text style={s.num}>{l.endValue != null ? num(l.endValue) : "–"}</Text>
            <Text style={s.num}>{num(l.kwh)}</Text>
            <Text style={s.num}>{num(l.ctPerKwh, 2)}</Text>
            <Text style={s.num}>{eur(l.cents)}</Text>
          </View>
        ))}
        <View style={s.total}>
          <Text style={{ flex: 1 }}>{refund ? "Erstattungsbetrag" : "Rechnungsbetrag"}</Text>
          <Text style={s.num}>{num(data.kwh)}</Text>
          <Text style={s.num}></Text>
          <Text style={s.num}>{eur(data.cents)}</Text>
        </View>
        {data.lines.some((l) => l.interpolated) && (
          <Text style={s.small}>* Zählerstand am Preis- bzw. Stichtag zwischen zwei Ablesungen anteilig ermittelt.</Text>
        )}
        {data.estimateNotes.map((n, i) => <Text key={i} style={s.small}>Schätzung: {n}</Text>)}
        <Text style={s.note}>
          {refund
            ? "Den Betrag überweisen wir Ihnen in den nächsten Tagen auf Ihr bekanntes Konto."
            : `Bitte überweisen Sie den Betrag innerhalb von 14 Tagen${data.landlord.iban ? ` auf das Konto ${data.landlord.iban}${data.landlord.bank ? ` (${data.landlord.bank})` : ""}` : ""} unter Angabe der Nr. ${data.number}.`}
        </Text>
        <Text style={s.note}>Mit freundlichen Grüßen{"\n"}{data.landlord.name}</Text>
        <Text style={s.footer} fixed>{data.landlord.name} · {data.landlord.address}</Text>
      </Page>
    </Document>
  );
}
