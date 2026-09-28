import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { TripLogData } from "@/server/trip-sync";
import { VEHICLE_COST_LABELS, formatKm } from "@/lib/vehicle";
import { formatRate } from "@/lib/vehicle-rate";
import { formatDateObj } from "@/lib/dates";
import type { VehicleCostCategory } from "@/db/schema";

const s = StyleSheet.create({
  page: { fontSize: 8.5, padding: 36, color: "#111" },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 3 },
  subtitle: { fontSize: 9.5, color: "#555", marginBottom: 14 },
  box: { marginBottom: 12, padding: 8, backgroundColor: "#f5f5f5", borderRadius: 3 },
  boxRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  hdr: { flexDirection: "row", paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#333", fontWeight: 700 },
  row: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5" },
  date: { width: 52 },
  prop: { width: 110, paddingRight: 4 },
  route: { flex: 1, paddingRight: 4 },
  purpose: { flex: 1, paddingRight: 4 },
  km: { width: 38, textAlign: "right" },
  amt: { width: 58, textAlign: "right" },
  total: { flexDirection: "row", paddingTop: 4, fontWeight: 700 },
  warn: { color: "#b45309", marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#999", textAlign: "center" },
});

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
// Standardschrift (Helvetica/WinAnsi) kennt „→" nicht
function pdfText(v: string) {
  return v.replace(/\s*→\s*/g, " > ");
}
function d(iso: string) {
  const [y, m, dd] = iso.split("-");
  return `${dd}.${m}.${y}`;
}

// Fahrtenliste je Fahrzeug und Jahr: Herleitung des km-Satzes und alle Fahrten zu Mietobjekten
export function TripLogPdf({ data }: { data: TripLogData }): React.ReactElement<DocumentProps> {
  const r = data.result;
  const totalKm = data.trips.reduce((a, t) => a + t.km, 0);
  const totalCents = data.trips.reduce((a, t) => a + t.cents, 0);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Fahrtenliste {data.year}</Text>
        <Text style={s.subtitle}>
          {data.vehicle.name}{data.vehicle.plate ? ` (${data.vehicle.plate})` : ""} · Nutzung {d(r.segmentStart)} – {d(r.segmentEnd)} · Fahrten zu vermieteten Objekten
        </Text>

        <View style={s.box}>
          {r.method === "flat" ? (
            <View style={s.boxRow}><Text>Methode</Text><Text>Pauschale 0,30 € je gefahrenem km</Text></View>
          ) : (
            <>
              {Object.entries(r.costsByCategory).map(([cat, cents]) => (
                <View key={cat} style={s.boxRow}>
                  <Text>{VEHICLE_COST_LABELS[cat as VehicleCostCategory] ?? cat}</Text>
                  <Text>{eur(cents)}</Text>
                </View>
              ))}
              <View style={[s.boxRow, { fontWeight: 700, borderTopWidth: 0.5, borderTopColor: "#999", marginTop: 2, paddingTop: 2 }]}>
                <Text>Fahrzeugkosten im Zeitraum</Text><Text>{eur(r.costCents)}</Text>
              </View>
              <View style={s.boxRow}>
                <Text>km-Stand Beginn / Ende</Text>
                <Text>{r.startKm != null ? formatKm(r.startKm) : "fehlt"} / {r.endKm != null ? formatKm(r.endKm) : "fehlt"}</Text>
              </View>
              <View style={s.boxRow}>
                <Text>{r.provisional ? "Gesamt-km (geschätzt)" : "Gesamt-km lt. km-Stand"}</Text>
                <Text>{r.basisKm != null ? formatKm(r.basisKm) : "–"} km</Text>
              </View>
              <View style={[s.boxRow, { fontWeight: 700 }]}>
                <Text>Individueller km-Satz</Text>
                <Text>{r.rateCentsPerKm != null ? `${formatRate(r.rateCentsPerKm)} €/km` : "–"}</Text>
              </View>
              {r.provisional && <Text style={s.warn}>Vorläufig: km-Stand zu Beginn und/oder Ende des Zeitraums fehlt, Gesamt-km geschätzt.</Text>}
            </>
          )}
        </View>

        <View style={s.hdr} fixed>
          <Text style={s.date}>Datum</Text>
          <Text style={s.prop}>Objekt</Text>
          <Text style={s.route}>Strecke</Text>
          <Text style={s.purpose}>Anlass</Text>
          <Text style={s.km}>km</Text>
          <Text style={s.amt}>Betrag</Text>
        </View>
        {data.trips.map((t, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.date}>{d(t.date)}</Text>
            <Text style={s.prop}>{t.property}</Text>
            <Text style={s.route}>{pdfText(t.route)}</Text>
            <Text style={s.purpose}>{pdfText(t.purpose)}</Text>
            <Text style={s.km}>{formatKm(t.km)}</Text>
            <Text style={s.amt}>{eur(t.cents)}</Text>
          </View>
        ))}
        <View style={s.total}>
          <Text style={{ flex: 1 }}>{data.trips.length} Fahrten</Text>
          <Text style={s.km}>{formatKm(totalKm)}</Text>
          <Text style={s.amt}>{eur(totalCents)}</Text>
        </View>

        <Text style={s.footer} fixed>
          Erstellt mit Domora · {formatDateObj(new Date())}
        </Text>
      </Page>
    </Document>
  );
}
