import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { OdometerSection } from "@/components/vehicles/odometer-section";
import { VehicleCostForm } from "@/components/vehicles/vehicle-cost-form";
import { VehicleYearControls } from "@/components/trips/vehicle-year-controls";
import { ReceiptsSection } from "@/components/expense/receipts-section";
import { getVehicleDetailAction } from "@/server/actions/vehicles";
import { getReceiptPanelAction } from "@/server/actions/document-links";
import { getDocumentTargetsAction } from "@/server/actions/documents";
import { formatMoney } from "@/lib/money";
import { formatDate, todayLocal } from "@/lib/dates";
import { formatRate } from "@/lib/vehicle-rate";
import { VEHICLE_COST_LABELS, formatKm } from "@/lib/vehicle";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fahrzeug – Domora" };

export default async function VehicleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const detail = await getVehicleDetailAction(id);
  if (!detail) notFound();
  const { vehicle, odometer, costs, years } = detail;
  const selected = years.find((y) => String(y.year) === sp.year) ?? years[0];
  const [panel, targets] = await Promise.all([
    selected ? getReceiptPanelAction("vehicle_year", selected.yearId) : null,
    getDocumentTargetsAction(),
  ]);
  const yearCosts = selected ? costs.filter((c) => c.date.startsWith(String(selected.year)) || (c.servicePeriodStart && c.servicePeriodStart.slice(0, 4) <= String(selected.year) && (c.servicePeriodEnd ?? "") >= `${selected.year}`)) : costs;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/expenses/trips#fahrzeuge"><ArrowLeft className="size-4" />Fahrten & Fahrzeuge</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{vehicle.name}</h1>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Stammdaten</h2>
        <VehicleForm
          mode="edit"
          vehicleId={id}
          defaults={{
            name: vehicle.name, plate: vehicle.plate ?? "", fuelType: vehicle.fuelType, ownership: vehicle.ownership,
            inUseFrom: vehicle.inUseFrom, inUseTo: vehicle.inUseTo ?? "", notes: vehicle.notes ?? "",
          }}
        />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">km-Stände</h2>
        <OdometerSection vehicleId={id} readings={odometer} />
      </section>

      {years.length > 0 && selected && (
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Jahr</h2>
            {years.map((y) => (
              <Link key={y.year} href={`/expenses/vehicles/${id}?year=${y.year}`}
                className={cn("rounded-full border px-3 py-2 text-xs sm:py-1 tabular-nums", y.year === selected.year ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
                {y.year}
              </Link>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Zeitraum</dt><dd>{formatDate(selected.result.segmentStart)} – {formatDate(selected.result.segmentEnd)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Kosten</dt><dd className="tabular-nums">{formatMoney(selected.result.costCents)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">km Beginn / Ende</dt><dd className="tabular-nums">{selected.result.startKm != null ? formatKm(selected.result.startKm) : "fehlt"} / {selected.result.endKm != null ? formatKm(selected.result.endKm) : "fehlt"}</dd></div>
            <div>
              <dt className="text-xs text-muted-foreground">km-Satz</dt>
              <dd className="font-semibold tabular-nums">
                {selected.result.rateCentsPerKm != null ? `${formatRate(selected.result.rateCentsPerKm)} €/km` : "–"}
                {selected.result.provisional && <span className="ml-1 inline-flex items-center gap-0.5 text-xs font-normal text-amber-600"><AlertTriangle className="size-3" />vorläufig</span>}
              </dd>
            </div>
            <div><dt className="text-xs text-muted-foreground">Fahrten</dt><dd className="tabular-nums">{selected.tripCount} · {formatKm(selected.tripKm)} km</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fahrtkosten</dt><dd className="tabular-nums">{formatMoney(selected.tripCents)}</dd></div>
          </dl>
          <VehicleYearControls vehicleId={id} year={selected.year} method={selected.method} estimatedKm={selected.estimatedKm} hasTrips={selected.tripCount > 0} />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Kosten {selected.year}</h3>
            {yearCosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Kosten erfasst.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {yearCosts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/expenses/vehicles/${id}/costs/${c.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                      <span className="w-20 tabular-nums text-muted-foreground">{formatDate(c.date)}</span>
                      <span className="min-w-0 flex-1 truncate">{c.description || VEHICLE_COST_LABELS[c.category]} <span className="text-xs text-muted-foreground">· {VEHICLE_COST_LABELS[c.category]}</span></span>
                      {c.receiptCount > 0 ? <Paperclip className="size-3.5 text-muted-foreground" /> : <span className="text-[11px] text-amber-600">Beleg fehlt</span>}
                      <span className="w-24 text-right tabular-nums">{formatMoney(c.amountCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2 text-sm">Kosten hinzufügen</summary>
              <div className="border-t p-3">
                <VehicleCostForm mode="create" vehicleId={id}
                  defaults={{ date: `${selected.year}-${todayLocal().slice(5)}` > todayLocal() ? todayLocal() : `${selected.year}-${todayLocal().slice(5)}`, category: "leasing", amount: "", description: "", periodStart: "", periodEnd: "", notes: "" }} />
              </div>
            </details>
          </div>

          {panel && (
            <ReceiptsSection
              targetType="vehicle_year"
              targetId={selected.yearId}
              data={panel}
              targets={targets}
              hint={`Belege für das Fahrzeugjahr ${selected.year}: Fahrtenliste, Leasingvertrag, Tachofotos. Sie gelten für alle Fahrten des Jahres. Rechnungen bitte direkt bei den Kosten ablegen.`}
            />
          )}
        </section>
      )}
    </div>
  );
}
