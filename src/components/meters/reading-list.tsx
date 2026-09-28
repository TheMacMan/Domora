"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMeterReadingAction, deleteMeterReadingAction } from "@/server/actions/meters";
import { DocumentUploadForm } from "@/components/document/document-upload-form";
import { todayLocal } from "@/lib/dates";

const REASONS = { year_end: "Jahresende", move_out: "Auszug", move_in: "Einzug", price_change: "Preiswechsel", interim: "Zwischenablesung" } as const;
type Reason = keyof typeof REASONS;
type Reading = { id: string; date: string; value: number; reason: Reason; note: string | null };

const d = (iso: string) => iso.split("-").reverse().join(".");

// Zählerstände eines Zählers: erfassen (mit Plausibilitätsprüfung), entfernen, Foto nachreichen
export function ReadingList({ meterId, propertyId, readings }: { meterId: string; propertyId: string; readings: Reading[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState({ date: todayLocal(), value: "", reason: "interim" as Reason, note: "" });
  const [photoFor, setPhotoFor] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addMeterReadingAction(meterId, { date: f.date, value: Number(f.value.replace(/\./g, "").replace(",", ".")), reason: f.reason, note: f.note || undefined });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Zählerstand gespeichert – Foto optional");
      setPhotoFor(res.id);
      setF({ ...f, value: "", note: "" });
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!window.confirm("Zählerstand entfernen?")) return;
    startTransition(async () => {
      const res = await deleteMeterReadingAction(id);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {readings.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {readings.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-1 pl-3 pr-1">
              <span className="w-24 tabular-nums text-muted-foreground">{d(r.date)}</span>
              <span className="w-28 font-medium tabular-nums">{r.value.toLocaleString("de-DE")} kWh</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{REASONS[r.reason]}{r.note ? ` · ${r.note}` : ""}</span>
              <button type="button" onClick={() => remove(r.id)} disabled={isPending} className="size-10 sm:size-8 inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive" aria-label={`Stand vom ${d(r.date)} entfernen`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_9rem_9rem_1fr_auto]">
        <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required className="h-10 sm:h-8 sm:text-xs" aria-label="Datum" />
        <Input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Stand kWh" required className="h-10 sm:h-8 sm:text-xs" />
        <select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value as Reason })} className="h-10 rounded-md border border-input bg-transparent px-2 sm:h-8 sm:text-xs" aria-label="Anlass">
          {Object.entries(REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Notiz, z. B. lt. Übergabeprotokoll" className="h-10 sm:h-8 sm:text-xs" />
        <Button type="submit" size="sm" variant="outline" className="col-span-2 h-10 sm:col-span-1 sm:h-8" disabled={isPending}>Stand speichern</Button>
      </form>
      {photoFor && (
        <DocumentUploadForm
          entityType="property"
          entityId={propertyId}
          linkTarget={{ type: "meter_reading", id: photoFor }}
          defaultTag="Energie"
          defaultOpen
          label="Foto des Zählerstands hochladen"
        />
      )}
    </div>
  );
}
