"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVehicleCostAction, deleteVehicleCostAction, updateVehicleCostAction } from "@/server/actions/vehicles";
import { VEHICLE_COST_LABELS } from "@/lib/vehicle";
import type { VehicleCostCategory } from "@/db/schema";

const selectClass =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

type Values = { date: string; category: VehicleCostCategory; amount: string; description: string; periodStart: string; periodEnd: string; notes: string };

export function VehicleCostForm({ mode, vehicleId, costId, defaults }: { mode: "create" | "edit"; vehicleId: string; costId?: string; defaults: Values }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [v, setV] = useState<Values>(defaults);
  const set = (k: keyof Values, value: string) => setV((c) => ({ ...c, [k]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      date: v.date,
      category: v.category,
      amountEur: Number(v.amount.replace(/\./g, "").replace(",", ".")),
      description: v.description || undefined,
      servicePeriodStart: v.periodStart,
      servicePeriodEnd: v.periodEnd,
      notes: v.notes || undefined,
    };
    startTransition(async () => {
      if (mode === "create") {
        const res = await createVehicleCostAction(vehicleId, data);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Kosten gespeichert – Beleg jetzt hochladen");
        router.push(`/expenses/vehicles/${vehicleId}/costs/${res.id}`);
      } else {
        const res = await updateVehicleCostAction(costId!, data);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Gespeichert");
        router.refresh();
      }
    });
  }

  function remove() {
    if (!costId || !window.confirm("Kosten entfernen? Der km-Satz wird neu berechnet.")) return;
    startTransition(async () => {
      const res = await deleteVehicleCostAction(costId);
      if (!res.ok) return void toast.error(res.error);
      router.push(`/expenses/vehicles/${vehicleId}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-date">Datum</Label>
          <Input id="c-date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-cat">Kategorie</Label>
          <select id="c-cat" className={selectClass} value={v.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(VEHICLE_COST_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-amt">Betrag (€)</Label>
          <Input id="c-amt" inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-desc">Beschreibung</Label>
        <Input id="c-desc" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="z. B. Leasingrate 03/2025, Reifen hinten" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-ps">Leistungszeitraum von <span className="font-normal text-muted-foreground">– optional</span></Label>
          <Input id="c-ps" type="date" value={v.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-pe">bis</Label>
          <Input id="c-pe" type="date" value={v.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Mit Leistungszeitraum wird der Betrag tageweise auf Jahre und Fahrzeugwechsel verteilt (z. B. Leasing-Sonderzahlung, Jahresversicherung).</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-notes">Notiz</Label>
        <Input id="c-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={isPending}>{mode === "create" ? "Kosten hinzufügen" : "Speichern"}</Button>
        {mode === "edit" && (
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={isPending} className="ml-auto text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
            Entfernen
          </Button>
        )}
      </div>
    </form>
  );
}
