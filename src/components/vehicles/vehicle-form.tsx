"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVehicleAction, deleteVehicleAction, updateVehicleAction } from "@/server/actions/vehicles";
import { FUEL_LABELS, OWNERSHIP_LABELS } from "@/lib/vehicle";
import type { VehicleInput } from "@/lib/validators/vehicle";

const selectClass =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function VehicleForm({ mode, vehicleId, defaults }: { mode: "create" | "edit"; vehicleId?: string; defaults: VehicleInput }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [v, setV] = useState<VehicleInput>(defaults);
  const set = <K extends keyof VehicleInput>(k: K, value: VehicleInput[K]) => setV((c) => ({ ...c, [k]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      if (mode === "create") {
        const res = await createVehicleAction(v);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Fahrzeug angelegt");
        router.push(`/expenses/vehicles/${res.id}`);
      } else {
        const res = await updateVehicleAction(vehicleId!, v);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Gespeichert");
        router.refresh();
      }
    });
  }

  function remove() {
    if (!vehicleId || !window.confirm(`„${v.name}“ entfernen?`)) return;
    startTransition(async () => {
      const res = await deleteVehicleAction(vehicleId);
      if (!res.ok) return void toast.error(res.error);
      router.push("/expenses/vehicles");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-name">Name</Label>
          <Input id="v-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="z. B. Leasing-Auto" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-plate">Kennzeichen <span className="font-normal text-muted-foreground">– optional</span></Label>
          <Input id="v-plate" value={v.plate ?? ""} onChange={(e) => set("plate", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-fuel">Antrieb</Label>
          <select id="v-fuel" className={selectClass} value={v.fuelType} onChange={(e) => set("fuelType", e.target.value as VehicleInput["fuelType"])}>
            {Object.entries(FUEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-own">Besitzart</Label>
          <select id="v-own" className={selectClass} value={v.ownership} onChange={(e) => set("ownership", e.target.value as VehicleInput["ownership"])}>
            {Object.entries(OWNERSHIP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-from">In Nutzung ab</Label>
          <Input id="v-from" type="date" value={v.inUseFrom} onChange={(e) => set("inUseFrom", e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-to">bis <span className="font-normal text-muted-foreground">– leer = in Nutzung</span></Label>
          <Input id="v-to" type="date" value={v.inUseTo ?? ""} onChange={(e) => set("inUseTo", e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="v-notes">Notiz <span className="font-normal text-muted-foreground">– optional</span></Label>
        <Input id="v-notes" value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="z. B. Leasing bis 03/2028, Vertragsnummer" />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" loading={isPending}>{mode === "create" ? "Anlegen" : "Speichern"}</Button>
        {mode === "edit" && (
          <Button type="button" variant="ghost" onClick={remove} disabled={isPending} className="ml-auto text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
            Entfernen
          </Button>
        )}
      </div>
    </form>
  );
}
