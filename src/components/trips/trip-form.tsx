"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTripAction, deleteTripAction, updateTripAction } from "@/server/actions/vehicles";

const selectClass =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50";

type Vehicle = { id: string; name: string; inUseFrom: string; inUseTo: string | null };
type Route = { id: string; name: string; route: string; km: number; propertyId: string | null };
type Values = { vehicleId: string; propertyId: string; date: string; route: string; km: string; purpose: string };

function vehicleFor(vehicles: Vehicle[], date: string) {
  return vehicles.find((v) => v.inUseFrom <= date && (!v.inUseTo || v.inUseTo >= date));
}

// Fahrt erfassen/bearbeiten. Fahrzeug wird nach Datum vorbelegt, gespeicherte Strecken
// füllen Strecke, km und Objekt. Den Betrag berechnet die App aus dem km-Satz.
export function TripForm({
  mode,
  tripId,
  defaults,
  vehicles,
  properties,
  routes,
}: {
  mode: "create" | "edit";
  tripId?: string;
  defaults: Values;
  vehicles: Vehicle[];
  properties: Array<{ id: string; label: string }>;
  routes: Route[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [v, setV] = useState<Values>(() => ({
    ...defaults,
    vehicleId: defaults.vehicleId || vehicleFor(vehicles, defaults.date)?.id || vehicles[0]?.id || "",
  }));
  const set = (k: keyof Values, value: string) => setV((cur) => ({ ...cur, [k]: value }));
  const activeVehicle = useMemo(() => vehicles.find((x) => x.id === v.vehicleId), [v.vehicleId, vehicles]);
  const outOfUse = activeVehicle && (v.date < activeVehicle.inUseFrom || (activeVehicle.inUseTo != null && v.date > activeVehicle.inUseTo));

  function onDate(date: string) {
    setV((cur) => {
      const auto = vehicleFor(vehicles, date);
      return { ...cur, date, vehicleId: auto?.id ?? cur.vehicleId };
    });
  }

  function onRoute(id: string) {
    const r = routes.find((x) => x.id === id);
    if (!r) return;
    setV((cur) => ({ ...cur, route: r.route, km: String(r.km).replace(".", ","), propertyId: r.propertyId ?? cur.propertyId }));
  }

  function submit(e: React.FormEvent, again = false) {
    e.preventDefault();
    const km = Number(v.km.replace(",", "."));
    const data = { vehicleId: v.vehicleId, propertyId: v.propertyId, date: v.date, route: v.route, km, purpose: v.purpose };
    startTransition(async () => {
      const res = mode === "create" ? await createTripAction(data) : await updateTripAction(tripId!, data);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Fahrt gespeichert");
      if (again) {
        setV((cur) => ({ ...cur, purpose: "" }));
        router.refresh();
      } else {
        router.push(`/expenses/trips?year=${v.date.slice(0, 4)}`);
      }
    });
  }

  function remove() {
    if (!tripId || !window.confirm("Fahrt löschen? Die zugehörige Fahrtkosten-Buchung wird ebenfalls entfernt.")) return;
    startTransition(async () => {
      const res = await deleteTripAction(tripId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Fahrt gelöscht");
      router.push(`/expenses/trips?year=${v.date.slice(0, 4)}`);
    });
  }

  if (vehicles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        Noch kein Fahrzeug angelegt. Lege zuerst unter „Fahrzeuge“ ein Fahrzeug an.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      {routes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-route-pick">Gespeicherte Strecke</Label>
          <select id="t-route-pick" className={selectClass} defaultValue="" onChange={(e) => onRoute(e.target.value)} disabled={isPending}>
            <option value="">– wählen, um Strecke, km und Objekt zu übernehmen –</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name} · {String(r.km).replace(".", ",")} km</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-date">Datum</Label>
          <Input id="t-date" type="date" value={v.date} onChange={(e) => onDate(e.target.value)} required disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-vehicle">Fahrzeug</Label>
          <select id="t-vehicle" className={selectClass} value={v.vehicleId} onChange={(e) => set("vehicleId", e.target.value)} disabled={isPending}>
            {vehicles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {outOfUse && <p className="text-xs text-destructive">Fahrzeug war an diesem Datum nicht in Nutzung.</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="t-property">Objekt</Label>
        <select id="t-property" className={selectClass} value={v.propertyId} onChange={(e) => set("propertyId", e.target.value)} required disabled={isPending}>
          <option value="" disabled>Objekt wählen</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-route">Strecke</Label>
          <Input id="t-route" value={v.route} onChange={(e) => set("route", e.target.value)} placeholder="Wohnort → Objekt → zurück" required disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="t-km">km (hin + zurück)</Label>
          <Input id="t-km" inputMode="decimal" value={v.km} onChange={(e) => set("km", e.target.value)} required disabled={isPending} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="t-purpose">Anlass</Label>
        <Input id="t-purpose" value={v.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="z. B. Übergabe, Handwerkertermin" required disabled={isPending} />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" loading={isPending}>Speichern</Button>
        {mode === "create" && (
          <Button type="button" variant="outline" disabled={isPending} onClick={(e) => submit(e, true)}>
            Speichern & weitere Fahrt
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={isPending} onClick={() => router.push("/expenses/trips")}>Abbrechen</Button>
        {mode === "edit" && (
          <Button type="button" variant="ghost" disabled={isPending} onClick={remove} className="ml-auto text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
            Löschen
          </Button>
        )}
      </div>
    </form>
  );
}
