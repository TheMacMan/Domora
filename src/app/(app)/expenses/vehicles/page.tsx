import Link from "next/link";
import { Car, Plus } from "lucide-react";
import { ExpenseTabs } from "@/components/expense/expense-tabs";
import { Button } from "@/components/ui/button";
import { getVehiclesAction } from "@/server/actions/vehicles";
import { formatDate, todayLocal } from "@/lib/dates";
import { FUEL_LABELS, OWNERSHIP_LABELS } from "@/lib/vehicle";

export const metadata = { title: "Fahrzeuge – Domora" };

// Fahrzeuge mit Nutzungszeiträumen; Zeitleiste macht Wechsel im Jahr sichtbar
export default async function VehiclesPage() {
  const list = await getVehiclesAction();
  const today = todayLocal();
  const firstYear = Math.min(...list.map((v) => +v.inUseFrom.slice(0, 4)), +today.slice(0, 4));
  const lastYear = +today.slice(0, 4);
  const span = Date.UTC(lastYear + 1, 0, 1) - Date.UTC(firstYear, 0, 1);
  const pos = (iso: string) => ((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(firstYear, 0, 1)) / span) * 100;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ausgaben</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fahrzeuge: Kosten und km-Stände ergeben den km-Satz für die Fahrten</p>
        </div>
        <Button asChild size="sm">
          <Link href="/expenses/vehicles/new"><Plus className="size-4" />Fahrzeug anlegen</Link>
        </Button>
      </div>

      <ExpenseTabs active="vehicles" />

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Noch kein Fahrzeug angelegt.</div>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-4">
            <div className="relative mb-2 h-4 text-[10px] text-muted-foreground">
              {years.map((y) => (
                <span key={y} className="absolute" style={{ left: `${pos(`${y}-01-01`)}%` }}>{y}</span>
              ))}
            </div>
            <div className="space-y-2">
              {list.map((v) => {
                const from = pos(v.inUseFrom < `${firstYear}-01-01` ? `${firstYear}-01-01` : v.inUseFrom);
                const to = pos(v.inUseTo ?? today);
                return (
                  <div key={v.id} className="relative h-6 rounded bg-muted/40">
                    <Link
                      href={`/expenses/vehicles/${v.id}`}
                      className="absolute top-0 flex h-6 items-center overflow-hidden rounded bg-primary/80 px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary"
                      style={{ left: `${from}%`, width: `${Math.max(to - from, 2)}%` }}
                      title={`${v.name}: ${formatDate(v.inUseFrom)} – ${v.inUseTo ? formatDate(v.inUseTo) : "heute"}`}
                    >
                      <span className="truncate">{v.name}</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>

          <ul className="divide-y rounded-xl border bg-card">
            {list.map((v) => (
              <li key={v.id}>
                <Link href={`/expenses/vehicles/${v.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <Car className="size-5 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{v.name}{v.plate ? ` · ${v.plate}` : ""}</p>
                    <p className="text-xs text-muted-foreground">
                      {OWNERSHIP_LABELS[v.ownership]} · {FUEL_LABELS[v.fuelType]} · {formatDate(v.inUseFrom)} – {v.inUseTo ? formatDate(v.inUseTo) : "in Nutzung"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
