"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMeterAction, deleteMeterAction, updateMeterAction } from "@/server/actions/meters";

const selectClass =
  "border-input flex h-10 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] sm:h-9";

type Values = {
  name: string; meterNumber: string; kind: "meter" | "estimate"; purpose: "heating" | "common" | "unit";
  hostUnitId: string; unitId: string; estimateKwhPerYear: string; estimateNote: string; calibrationUntil: string; notes: string;
};

export function MeterForm({ propertyId, meterId, units, defaults, onDone }: {
  propertyId: string;
  meterId?: string;
  units: Array<{ id: string; name: string }>;
  defaults: Values;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [v, setV] = useState<Values>(defaults);
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((c) => ({ ...c, [k]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: v.name, meterNumber: v.meterNumber || undefined, kind: v.kind, purpose: v.purpose, hostUnitId: v.hostUnitId,
      unitId: v.purpose === "unit" ? v.unitId || null : null,
      estimateKwhPerYear: v.kind === "estimate" && v.estimateKwhPerYear ? Number(v.estimateKwhPerYear.replace(",", ".")) : null,
      estimateNote: v.estimateNote || undefined, calibrationUntil: v.calibrationUntil, notes: v.notes || undefined,
    };
    startTransition(async () => {
      const res = meterId ? await updateMeterAction(meterId, data) : await createMeterAction(propertyId, data);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Zähler gespeichert");
      if (!meterId) setV(defaults);
      onDone?.();
      router.refresh();
    });
  }

  function remove() {
    if (!meterId || !window.confirm(`„${v.name}“ entfernen? Zählerstände und Abrechnungen bleiben erhalten.`)) return;
    startTransition(async () => {
      const res = await deleteMeterAction(meterId);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`m-name-${meterId ?? "new"}`}>Name</Label>
          <Input id={`m-name-${meterId ?? "new"}`} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="z. B. Heizung, Einliegerwohnung" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Art</Label>
          <select className={selectClass} value={v.kind} onChange={(e) => set("kind", e.target.value as Values["kind"])} aria-label="Art">
            <option value="meter">Zwischenzähler (Ablesung)</option>
            <option value="estimate">Kein Zähler – Schätzung</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Wofür</Label>
          <select className={selectClass} value={v.purpose} onChange={(e) => set("purpose", e.target.value as Values["purpose"])} aria-label="Zweck">
            <option value="heating">Heizung (→ Heizkosten, umgelegt)</option>
            <option value="common">Allgemeinstrom (→ Beleuchtung, umgelegt)</option>
            <option value="unit">Wohnung (→ Mieter zahlt nach Verbrauch)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Läuft über den Stromvertrag von</Label>
          <select className={selectClass} value={v.hostUnitId} onChange={(e) => set("hostUnitId", e.target.value)} aria-label="Stromvertrag">
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        {v.purpose === "unit" && (
          <div className="flex flex-col gap-1.5">
            <Label>Verbraucher (Wohnung)</Label>
            <select className={selectClass} value={v.unitId} onChange={(e) => set("unitId", e.target.value)} aria-label="Verbraucher">
              <option value="">– wählen –</option>
              {units.filter((u) => u.id !== v.hostUnitId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        {v.kind === "meter" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Zählernummer <span className="font-normal text-muted-foreground">– optional</span></Label>
              <Input value={v.meterNumber} onChange={(e) => set("meterNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Eichfrist bis <span className="font-normal text-muted-foreground">– optional</span></Label>
              <Input type="date" value={v.calibrationUntil} onChange={(e) => set("calibrationUntil", e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Geschätzter Verbrauch (kWh/Jahr)</Label>
              <Input inputMode="decimal" value={v.estimateKwhPerYear} onChange={(e) => set("estimateKwhPerYear", e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Herleitung</Label>
              <Input value={v.estimateNote} onChange={(e) => set("estimateNote", e.target.value)} placeholder="z. B. 8 LED × 10 W × 3 h/Tag" />
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={isPending}>{meterId ? "Speichern" : "Zähler anlegen"}</Button>
        {meterId && (
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={isPending} className="ml-auto text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
            Entfernen
          </Button>
        )}
      </div>
    </form>
  );
}
