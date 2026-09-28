"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTripRouteAction, deleteTripRouteAction } from "@/server/actions/vehicles";

const selectClass = "border-input h-8 rounded-md border bg-transparent px-2 text-xs";

type Route = { id: string; name: string; route: string; km: number; propertyId: string | null };

// Gespeicherte Strecken für die schnelle Erfassung
export function RouteManager({ routes, properties }: { routes: Route[]; properties: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState({ name: "", route: "", km: "", propertyId: properties[0]?.id ?? "" });

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createTripRouteAction({ name: f.name, route: f.route, km: Number(f.km.replace(",", ".")), propertyId: f.propertyId || null });
      if (!res.ok) return void toast.error(res.error);
      setF({ name: "", route: "", km: "", propertyId: f.propertyId });
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteTripRouteAction(id);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {routes.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {routes.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1 pl-3 pr-1">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.route} · {String(r.km).replace(".", ",")} km</p>
              </div>
              <button type="button" onClick={() => remove(r.id)} disabled={isPending} className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive" aria-label={`${r.name} entfernen`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_5rem_1fr_auto]">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name, z. B. Alzenau" className="h-8 text-xs" required />
        <Input value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })} placeholder="Strecke, z. B. Wohnort → Objekt → zurück" className="h-8 text-xs" required />
        <Input value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} placeholder="km" inputMode="decimal" className="h-8 text-xs" required />
        <select className={selectClass} value={f.propertyId} onChange={(e) => setF({ ...f, propertyId: e.target.value })} aria-label="Objekt">
          {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={isPending}>
          <Plus className="size-4" />
          Strecke
        </Button>
      </form>
    </div>
  );
}
