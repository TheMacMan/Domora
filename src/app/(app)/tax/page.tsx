import Link from "next/link";
import { getTaxPropertiesAction, getAnlageVAction } from "@/server/actions/tax";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { FileDown } from "lucide-react";

export const metadata = { title: "Anlage V – Domora" };

function fmt(cents: number) {
  const pos = cents >= 0;
  return (pos ? "" : "−") + formatMoney(Math.abs(cents));
}

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string; year?: string }>;
}) {
  const { propertyId, year: yearStr } = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = yearStr ? parseInt(yearStr, 10) : currentYear;

  const propList = await getTaxPropertiesAction();
  const selectedId = propertyId ?? propList[0]?.id;
  const ergebnis = selectedId ? await getAnlageVAction(selectedId, year) : null;

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Anlage V</h1>
        {ergebnis && (
          <Button asChild size="sm">
            <a href={`/api/tax?propertyId=${selectedId}&year=${year}`} download>
              <FileDown className="size-4" />
              PDF herunterladen
            </a>
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Objekt</span>
          <div className="flex gap-2 flex-wrap">
            {propList.map((p) => (
              <Button
                key={p.id}
                asChild
                size="sm"
                variant={p.id === selectedId ? "default" : "outline"}
              >
                <Link href={`/tax?propertyId=${p.id}&year=${year}`}>
                  {p.street}, {p.city}
                </Link>
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Jahr</span>
          <div className="flex gap-2">
            {years.map((y) => (
              <Button
                key={y}
                asChild
                size="sm"
                variant={y === year ? "default" : "outline"}
              >
                <Link href={`/tax?propertyId=${selectedId}&year=${y}`}>{y}</Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {!ergebnis ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          Kein Objekt ausgewählt oder keine Daten vorhanden.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Einnahmen */}
          <div className="rounded-xl border bg-card">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold">Einnahmen</h2>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              {[
                ["Mieteinnahmen (Kaltmiete)", ergebnis.einnahmen.mieteinnahmenCents],
                ["Umlagen / NK-Vorauszahlungen", ergebnis.einnahmen.umlagenCents],
                ["Sonstige Einnahmen", ergebnis.einnahmen.sonstigeEinnahmenCents],
              ].map(([label, cents]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label as string}</span>
                  <span className="tabular-nums">{formatMoney(cents as number)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Gesamt</span>
                <span className="tabular-nums">{formatMoney(ergebnis.einnahmen.gesamtCents)}</span>
              </div>
            </div>
          </div>

          {/* Werbungskosten */}
          <div className="rounded-xl border bg-card">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold">Werbungskosten</h2>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              {[
                ["Schuldzinsen", ergebnis.werbungskosten.schuldzinsenCents],
                ["AfA", ergebnis.werbungskosten.afaCents],
                ["Erhaltungsaufwand", ergebnis.werbungskosten.erhaltungsaufwandCents],
                ["Herstellungs-/Anschaffungsnaher Aufwand", ergebnis.werbungskosten.kapitalaufwandCents],
                ["Grundsteuer", ergebnis.werbungskosten.grundsteuerCents],
                ["Sach-/Haftpflichtversicherung", ergebnis.werbungskosten.versicherungenCents],
                ["Verwaltungskosten", ergebnis.werbungskosten.verwaltungskostenCents],
                ["Übrige Betriebskosten (umlegbar)", ergebnis.werbungskosten.betriebskostenCents],
                ["Nicht umlegbare Kosten", ergebnis.werbungskosten.nichtUmlegbareCents],
                ["Sonstige Werbungskosten", ergebnis.werbungskosten.sonstigeCents],
              ].map(([label, cents]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label as string}</span>
                  <span className="tabular-nums">{formatMoney(cents as number)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Gesamt</span>
                <span className="tabular-nums">{formatMoney(ergebnis.werbungskosten.gesamtCents)}</span>
              </div>
              {ergebnis.leerstand.gesamtCents > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground pt-1 italic">
                  <span>davon Leerstand-Anteil (nicht umgelegt)</span>
                  <span className="tabular-nums">{formatMoney(ergebnis.leerstand.gesamtCents)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Ergebnis */}
          <div className={`lg:col-span-2 rounded-xl border px-5 py-5 ${ergebnis.ueberschussCents < 0 ? "bg-green-500/5 border-green-500/20" : "bg-card"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {ergebnis.ueberschussCents < 0
                    ? "Werbungskostenüberschuss (steuerlicher Verlust)"
                    : "Überschuss der Einnahmen über die Werbungskosten"}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {fmt(ergebnis.ueberschussCents)}
                </p>
              </div>
              <Button asChild variant="outline">
                <a href={`/api/tax?propertyId=${selectedId}&year=${year}`} download>
                  <FileDown className="size-4" />
                  PDF
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
