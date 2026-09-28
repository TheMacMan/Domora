import Link from "next/link";
import { AlertTriangle, Car, Copy, Pencil, Plus } from "lucide-react";
import { ExpenseTabs } from "@/components/expense/expense-tabs";
import { Button } from "@/components/ui/button";
import { VehicleYearControls } from "@/components/trips/vehicle-year-controls";
import { RouteManager } from "@/components/trips/route-manager";
import { VehiclesSection } from "@/components/vehicles/vehicles-section";
import { getTripsPageAction } from "@/server/actions/vehicles";
import { formatMoney } from "@/lib/money";
import { formatDate, todayLocal } from "@/lib/dates";
import { formatRate } from "@/lib/vehicle-rate";
import { formatKm } from "@/lib/vehicle";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fahrten – Domora" };

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(todayLocal().slice(0, 4));
  const data = await getTripsPageAction(year);
  const totalKm = data.trips.reduce((s, t) => s + t.km, 0);
  const totalCents = data.trips.reduce((s, t) => s + t.cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ausgaben</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fahrten zu den Mietobjekten – Betrag aus dem km-Satz des Fahrzeugs</p>
        </div>
        <Button asChild size="sm">
          <Link href="/expenses/trips/new">
            <Plus className="size-4" />
            Fahrt erfassen
          </Link>
        </Button>
      </div>

      <ExpenseTabs active="trips" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Jahr:</span>
        {data.years.map((y) => (
          <Link
            key={y}
            href={`/expenses/trips?year=${y}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium tabular-nums",
              y === year ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {y}
          </Link>
        ))}
      </div>

      {data.frequent.map((f) => (
        <div key={f.propertyId} className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <p>
            <strong>{f.label}</strong>: {f.count} Fahrten in {f.year}. Bei sehr häufigen Fahrten kann das Finanzamt das Objekt als
            regelmäßige Tätigkeitsstätte werten – dann gilt nur die Entfernungspauschale (0,30 € je Entfernungs-km, einfache Strecke).
          </p>
        </div>
      ))}

      {data.cards.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Kein Fahrzeug in {year} in Nutzung. <Link href="/expenses/vehicles/new" className="underline">Fahrzeug anlegen</Link> oder unten unter „Fahrzeuge“ den Nutzungszeitraum anpassen.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.cards.map((c) => {
            const r = c.result;
            return (
              <div key={c.vehicle.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/expenses/vehicles/${c.vehicle.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                      <Car className="size-4" />
                      {c.vehicle.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDate(r.segmentStart)} – {formatDate(r.segmentEnd)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums">
                      {r.rateCentsPerKm != null ? `${formatRate(r.rateCentsPerKm)} €/km` : "–"}
                    </p>
                    {r.method === "flat" ? (
                      <p className="text-xs text-muted-foreground">Pauschale</p>
                    ) : r.provisional ? (
                      <p className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="size-3" />vorläufig (km-Stand fehlt)</p>
                    ) : (
                      <p className="text-xs text-emerald-600">lt. km-Stand</p>
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Fahrzeugkosten</dt><dd className="tabular-nums">{formatMoney(r.costCents)}</dd></div>
                  <div><dt className="text-muted-foreground">km-Stand Beginn / Ende</dt><dd className="tabular-nums">{r.startKm != null ? formatKm(r.startKm) : "fehlt"} / {r.endKm != null ? formatKm(r.endKm) : "fehlt"}</dd></div>
                  <div><dt className="text-muted-foreground">{r.provisional ? "Gesamt-km (geschätzt)" : "Gesamt-km"}</dt><dd className="tabular-nums">{r.basisKm != null ? formatKm(r.basisKm) : "–"}</dd></div>
                  <div><dt className="text-muted-foreground">Fahrten</dt><dd className="tabular-nums">{c.tripCount} · {formatKm(c.tripKm)} km{r.basisKm ? ` (${Math.round((c.tripKm / r.basisKm) * 100)} %)` : ""}</dd></div>
                  <div><dt className="text-muted-foreground">Fahrtkosten</dt><dd className="font-semibold tabular-nums">{formatMoney(c.tripCents)}</dd></div>
                  <div><dt className="text-muted-foreground">Belege Fahrzeugjahr</dt><dd className={c.receiptCount ? "" : "text-amber-600"}>{c.receiptCount || "keine"}</dd></div>
                </dl>
                <VehicleYearControls
                  vehicleId={c.vehicle.id}
                  year={year}
                  method={r.method}
                  estimatedKm={r.provisional ? r.basisKm : null}
                  hasTrips={c.tripCount > 0}
                />
              </div>
            );
          })}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 bg-muted/30 px-4 py-3">
          <span className="font-semibold">{data.trips.length} Fahrten {year}</span>
          <span className="tabular-nums text-sm">{formatKm(totalKm)} km · <strong>{formatMoney(totalCents)}</strong></span>
        </div>
        {data.trips.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Keine Fahrten in {year}.</p>
        ) : (
          <ul className="divide-y">
            {data.trips.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{formatDate(t.date)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.purpose}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.property} · {t.route} · {t.vehicle}</p>
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatKm(t.km)} km</span>
                <span className="w-20 shrink-0 text-right font-medium tabular-nums">{formatMoney(t.cents)}</span>
                <div className="flex shrink-0">
                  <Button asChild variant="ghost" size="iconSm" title="Wiederholen">
                    <Link href={`/expenses/trips/new?from=${t.id}`}><Copy className="size-3.5" /></Link>
                  </Button>
                  <Button asChild variant="ghost" size="iconSm" title="Bearbeiten">
                    <Link href={`/expenses/trips/${t.id}/edit`}><Pencil className="size-3.5" /></Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details id="fahrzeuge" open={data.vehicles.length === 0} className="scroll-mt-20 rounded-xl border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Fahrzeuge ({data.vehicles.length})</summary>
        <div className="border-t p-4">
          <VehiclesSection vehicles={data.vehicles} today={todayLocal()} />
        </div>
      </details>

      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Gespeicherte Strecken ({data.routes.length})</summary>
        <div className="border-t p-4">
          <RouteManager routes={data.routes} properties={data.properties} />
        </div>
      </details>
    </div>
  );
}
