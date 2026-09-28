import { notFound } from "next/navigation";
import { AlertTriangle, Gauge } from "lucide-react";
import { PropertyTabs } from "@/components/property/property-tabs";
import { MeterForm } from "@/components/meters/meter-form";
import { ReadingList } from "@/components/meters/reading-list";
import { PriceList } from "@/components/meters/price-list";
import { SettlementPanel } from "@/components/meters/settlement-panel";
import { DocumentUploadForm } from "@/components/document/document-upload-form";
import { getMetersPageAction } from "@/server/actions/meters";
import { formatDate, todayLocal } from "@/lib/dates";

export const metadata = { title: "Zähler & Strom – Domora" };

const PURPOSE = { heating: "Heizung → Heizkosten", common: "Allgemeinstrom → Beleuchtung", unit: "Wohnung → Mieter zahlt" } as const;

export default async function MetersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getMetersPageAction(id);
  if (!data) notFound();
  const today = todayLocal();
  const firstUnit = data.units[0]?.id ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{data.property.street}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Strom über Zwischenzähler: erfassen, erstatten, abrechnen</p>
      </div>
      <PropertyTabs propertyId={id} active="meters" />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Zähler</h2>
        {data.meters.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Noch kein Zwischenzähler angelegt.</p>
        )}
        {data.meters.map((m) => (
          <div key={m.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 font-semibold"><Gauge className="size-4" />{m.name}{m.meterNumber ? <span className="text-xs font-normal text-muted-foreground">Nr. {m.meterNumber}</span> : null}</p>
                <p className="text-xs text-muted-foreground">
                  {PURPOSE[m.purpose]}{m.unit ? ` (${m.unit.name})` : ""} · über Stromvertrag {m.hostUnit.name}
                  {m.kind === "estimate" ? ` · Schätzung ${m.estimateKwhPerYear?.toLocaleString("de-DE")} kWh/Jahr` : ""}
                </p>
                {m.kind === "estimate" && m.estimateNote && <p className="text-xs text-muted-foreground">Herleitung: {m.estimateNote}</p>}
                {m.calibrationUntil && (
                  <p className={`text-xs ${m.calibrationUntil <= today ? "text-amber-600" : "text-muted-foreground"}`}>Eichfrist bis {formatDate(m.calibrationUntil)}</p>
                )}
              </div>
              {m.consumptionByYear.length > 0 && (
                <div className="text-right text-xs text-muted-foreground">
                  {m.consumptionByYear.slice(0, 3).map((c) => <p key={c.year}>{c.year}: <span className="tabular-nums text-foreground">{c.kwh.toLocaleString("de-DE")} kWh</span></p>)}
                </div>
              )}
            </div>
            {m.kind === "meter" && (
              <ReadingList meterId={m.id} propertyId={id} readings={m.readings.map((r) => ({ id: r.id, date: r.date, value: r.value, reason: r.reason, note: r.note }))} />
            )}
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2.5 text-sm">Zähler bearbeiten</summary>
              <div className="border-t p-3">
                <MeterForm
                  propertyId={id}
                  meterId={m.id}
                  units={data.units}
                  defaults={{
                    name: m.name, meterNumber: m.meterNumber ?? "", kind: m.kind, purpose: m.purpose, hostUnitId: m.hostUnitId,
                    unitId: m.unitId ?? "", estimateKwhPerYear: m.estimateKwhPerYear != null ? String(m.estimateKwhPerYear).replace(".", ",") : "",
                    estimateNote: m.estimateNote ?? "", calibrationUntil: m.calibrationUntil ?? "", notes: m.notes ?? "",
                  }}
                />
              </div>
            </details>
          </div>
        ))}
        <details open={data.meters.length === 0} className="rounded-xl border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Zähler anlegen</summary>
          <div className="border-t p-4">
            <MeterForm
              propertyId={id}
              units={data.units}
              defaults={{ name: "", meterNumber: "", kind: "meter", purpose: "heating", hostUnitId: firstUnit, unitId: "", estimateKwhPerYear: "", estimateNote: "", calibrationUntil: "", notes: "" }}
            />
          </div>
        </details>
      </section>

      {data.hostLeases.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Strompreise der Mieter</h2>
          <p className="text-xs text-muted-foreground">Arbeitspreis brutto ohne Grundpreis aus der Stromrechnung des Mieters, über dessen Vertrag die Zwischenzähler laufen. Rechnung als Beleg hochladen.</p>
          {data.hostLeases.map((l) => (
            <div key={l.id} className="space-y-2 rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">
                {l.label}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{formatDate(l.startDate)} – {l.endDate ? formatDate(l.endDate) : "heute"}</span>
                {l.prices.length === 0 && <AlertTriangle className="ml-1 inline size-3.5 text-amber-600" aria-label="Preis fehlt" />}
              </p>
              <PriceList leaseId={l.id} startDate={l.startDate} prices={l.prices} />
              {l.prices[0] && (
                <DocumentUploadForm
                  entityType="lease"
                  entityId={l.id}
                  linkTarget={{ type: "supply_price", id: l.prices[0].id }}
                  defaultTag="Energie"
                  label="Stromrechnung des Mieters hochladen"
                />
              )}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Abrechnungen</h2>
        <p className="text-xs text-muted-foreground">
          Erstattung an den Mieter mit dem Stromvertrag bzw. Rechnung an den Verbraucher, beliebig oft im Jahr. Gebucht wird erst bei Zahlung:
          Heizung → Heizkosten, Allgemeinstrom → Beleuchtung (beides umgelegt), Wohnungsstrom → Erstattung und Einnahme (neutral).
        </p>
        <SettlementPanel targets={data.targets} settlements={data.settlements} />
      </section>
    </div>
  );
}
