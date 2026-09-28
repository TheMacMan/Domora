"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addOdometerAction, deleteOdometerAction } from "@/server/actions/vehicles";
import { ODOMETER_LABELS, formatKm } from "@/lib/vehicle";
import { formatDate } from "@/lib/dates";

type Reading = { id: string; date: string; km: number; kind: keyof typeof ODOMETER_LABELS; note: string | null };

// km-Stände: Jahresbeginn/-ende bzw. Übernahme/Rückgabe bestimmen den km-Satz
export function OdometerSection({ vehicleId, readings }: { vehicleId: string; readings: Reading[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState({ date: "", km: "", kind: "year_end" as Reading["kind"], note: "" });

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addOdometerAction(vehicleId, { date: f.date, km: Number(f.km.replace(/\D/g, "")), kind: f.kind, note: f.note || undefined });
      if (!res.ok) return void toast.error(res.error);
      toast.success("km-Stand gespeichert – Fahrten neu berechnet");
      setF({ date: "", km: "", kind: f.kind, note: "" });
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!window.confirm("km-Stand entfernen?")) return;
    startTransition(async () => {
      const res = await deleteOdometerAction(id);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {readings.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {readings.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-1.5 pl-3 pr-1">
              <span className="w-24 tabular-nums text-muted-foreground">{formatDate(r.date)}</span>
              <span className="w-24 font-medium tabular-nums">{formatKm(r.km)} km</span>
              <span className="flex-1 text-xs text-muted-foreground">{ODOMETER_LABELS[r.kind]}{r.note ? ` · ${r.note}` : ""}</span>
              <button type="button" onClick={() => remove(r.id)} disabled={isPending} className="size-10 sm:size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive" aria-label="km-Stand entfernen">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_8rem_9rem_1fr_auto]">
        <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required className="h-10 sm:h-8 sm:text-xs" aria-label="Datum" />
        <Input inputMode="numeric" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} placeholder="km-Stand" required className="h-10 sm:h-8 sm:text-xs" />
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Reading["kind"] })} className="h-10 rounded-md border border-input bg-transparent px-2 sm:h-8 sm:text-xs" aria-label="Art">
          {Object.entries(ODOMETER_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Nachweis, z. B. Foto Tacho" className="h-10 sm:h-8 sm:text-xs" />
        <Button type="submit" size="sm" variant="outline" className="h-10 sm:h-8" disabled={isPending}>Hinzufügen</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Maßgeblich ist der Stand am 01.01. und 31.12. (bzw. bei Übernahme/Rückgabe), jeweils ± 14 Tage. Tachofotos als Beleg beim Jahr hochladen.
      </p>
    </div>
  );
}
