"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSupplyPriceAction, deleteSupplyPriceAction } from "@/server/actions/meters";

type Price = { id: string; validFrom: string; ctPerKwh: number; note: string | null };
const d = (iso: string) => iso.split("-").reverse().join(".");

// Arbeitspreise aus dem Stromvertrag eines Mieters (brutto, ohne Grundpreis)
export function PriceList({ leaseId, startDate, prices }: { leaseId: string; startDate: string; prices: Price[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState({ validFrom: prices.length === 0 ? startDate : "", ct: "", note: "" });

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addSupplyPriceAction({ leaseId, validFrom: f.validFrom, ctPerKwh: Number(f.ct.replace(",", ".")), note: f.note || undefined });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Preis gespeichert");
      setF({ validFrom: "", ct: "", note: "" });
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!window.confirm("Preis entfernen?")) return;
    startTransition(async () => {
      const res = await deleteSupplyPriceAction(id);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {prices.length === 0 ? (
        <p className="text-xs text-amber-600">Noch kein Arbeitspreis – aus der Stromrechnung des Mieters eintragen.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {prices.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-1 pl-3 pr-1">
              <span className="w-28 text-muted-foreground">ab {d(p.validFrom)}</span>
              <span className="font-medium tabular-nums">{p.ctPerKwh.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ct/kWh</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{p.note}</span>
              <button type="button" onClick={() => remove(p.id)} disabled={isPending} className="size-10 sm:size-8 inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive" aria-label="Preis entfernen">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_8rem_1fr_auto]">
        <Input type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} required className="h-10 sm:h-8 sm:text-xs" aria-label="gültig ab" />
        <Input inputMode="decimal" value={f.ct} onChange={(e) => setF({ ...f, ct: e.target.value })} placeholder="ct/kWh brutto" required className="h-10 sm:h-8 sm:text-xs" />
        <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Quelle, z. B. Rechnung Maingau 03/26" className="col-span-2 h-10 sm:col-span-1 sm:h-8 sm:text-xs" />
        <Button type="submit" size="sm" variant="outline" className="col-span-2 h-10 sm:col-span-1 sm:h-8" disabled={isPending}>Preis speichern</Button>
      </form>
    </div>
  );
}
