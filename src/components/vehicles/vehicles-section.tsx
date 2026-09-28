import Link from "next/link";
import { Car, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { FUEL_LABELS, OWNERSHIP_LABELS } from "@/lib/vehicle";

type Vehicle = {
  id: string;
  name: string;
  plate: string | null;
  fuelType: keyof typeof FUEL_LABELS;
  ownership: keyof typeof OWNERSHIP_LABELS;
  inUseFrom: string;
  inUseTo: string | null;
};

// Fahrzeuge mit Zeitleiste (macht Wechsel im Jahr sichtbar) und Liste — Teil des Reiters „Fahrten"
export function VehiclesSection({ vehicles, today }: { vehicles: Vehicle[]; today: string }) {
  const firstYear = Math.min(...vehicles.map((v) => +v.inUseFrom.slice(0, 4)), +today.slice(0, 4));
  const lastYear = +today.slice(0, 4);
  const span = Date.UTC(lastYear + 1, 0, 1) - Date.UTC(firstYear, 0, 1);
  const pos = (iso: string) => ((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(firstYear, 0, 1)) / span) * 100;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  return (
    <div className="space-y-3">
      {vehicles.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="relative mb-2 h-4 text-[10px] text-muted-foreground">
            {years.map((y) => (
              <span key={y} className="absolute" style={{ left: `${pos(`${y}-01-01`)}%` }}>{y}</span>
            ))}
          </div>
          <div className="space-y-2">
            {vehicles.map((v) => {
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
        </div>
      )}
      {vehicles.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link href={`/expenses/vehicles/${v.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                <Car className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{v.name}{v.plate ? ` · ${v.plate}` : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {OWNERSHIP_LABELS[v.ownership]} · {FUEL_LABELS[v.fuelType]} · {formatDate(v.inUseFrom)} – {v.inUseTo ? formatDate(v.inUseTo) : "in Nutzung"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button asChild size="sm" variant="outline">
        <Link href="/expenses/vehicles/new"><Plus className="size-4" />Fahrzeug anlegen</Link>
      </Button>
    </div>
  );
}
