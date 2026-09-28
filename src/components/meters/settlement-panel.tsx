"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentOpenButton } from "@/components/document/document-open-button";
import {
  createSettlementAction, deleteSettlementAction, markSettlementPaidAction, previewSettlementAction, type SettlementPreview,
} from "@/server/actions/meters";
import { formatMoney } from "@/lib/money";
import { todayLocal } from "@/lib/dates";

const selectClass =
  "border-input flex h-10 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] sm:h-9";
const d = (iso: string) => iso.split("-").reverse().join(".");
function dayBefore(iso: string) {
  return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) - 1)).toISOString().slice(0, 10);
}

type Target = { direction: "refund" | "charge"; leaseId: string; label: string; start: string; end: string };
type Settlement = {
  id: string; number: string; direction: "refund" | "charge"; recipient: string; periodStart: string; periodEnd: string;
  kwh: number; amountCents: number; status: "open" | "paid"; paidAt: string | null; documentId: string | null;
};

export function SettlementPanel({ targets, settlements }: { targets: Target[]; settlements: Settlement[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sel, setSel] = useState(0);
  const t = targets[sel];
  const [start, setStart] = useState(t?.start ?? "");
  const [end, setEnd] = useState(t?.end ?? "");
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [paidAt, setPaidAt] = useState<Record<string, string>>({});

  function choose(i: number) {
    setSel(i);
    setStart(targets[i]?.start ?? "");
    setEnd(targets[i]?.end ?? "");
    setPreview(null);
  }

  const input = t ? { direction: t.direction, leaseId: t.leaseId, periodStart: start, periodEnd: end } : null;

  function runPreview() {
    if (!input) return;
    startTransition(async () => setPreview(await previewSettlementAction(input)));
  }
  function create() {
    if (!input) return;
    startTransition(async () => {
      const res = await createSettlementAction(input);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Abrechnung erstellt – PDF unter Dokumente beim Mietvertrag");
      setPreview(null);
      router.refresh();
    });
  }
  function markPaid(id: string) {
    startTransition(async () => {
      const res = await markSettlementPaidAction(id, paidAt[id] ?? todayLocal());
      if (!res.ok) return void toast.error(res.error);
      toast.success("Als bezahlt gebucht");
      router.refresh();
    });
  }
  function remove(s: Settlement) {
    if (!window.confirm(`${s.number} entfernen?${s.status === "paid" ? " Die zugehörigen Buchungen werden ebenfalls entfernt." : ""} Das PDF bleibt archiviert.`)) return;
    startTransition(async () => {
      const res = await deleteSettlementAction(s.id);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {settlements.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {settlements.map((s) => (
            <li key={s.id} className="space-y-2 px-3 py-2.5 text-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.number} · {s.direction === "refund" ? "Erstattung an" : "Rechnung an"} {s.recipient}</p>
                  <p className="text-xs text-muted-foreground">
                    {d(s.periodStart)} – {d(dayBefore(s.periodEnd))} · {s.kwh.toLocaleString("de-DE")} kWh
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatMoney(s.amountCents)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {s.documentId && (
                  <DocumentOpenButton doc={{ id: s.documentId, filename: `${s.number}.pdf`, title: s.number, mimeType: "application/pdf" }} variant="icon" />
                )}
                {s.status === "paid" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="size-3.5" />bezahlt am {d(s.paidAt!)}</span>
                ) : (
                  <>
                    <Input type="date" value={paidAt[s.id] ?? todayLocal()} onChange={(e) => setPaidAt({ ...paidAt, [s.id]: e.target.value })} className="h-10 w-40 sm:h-8 sm:text-xs" aria-label="bezahlt am" />
                    <Button type="button" size="sm" variant="outline" className="h-10 sm:h-8" disabled={isPending} onClick={() => markPaid(s.id)}>
                      {s.direction === "refund" ? "Überwiesen" : "Zahlung eingegangen"}
                    </Button>
                  </>
                )}
                <button type="button" onClick={() => remove(s)} disabled={isPending} className="ml-auto size-10 sm:size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive" aria-label={`${s.number} entfernen`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offene Abrechnung möglich – Zähler und Mietverträge prüfen.</p>
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-semibold">Neue Abrechnung</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-target">Für</Label>
            <select id="st-target" className={selectClass} value={sel} onChange={(e) => choose(Number(e.target.value))}>
              {targets.map((x, i) => <option key={`${x.direction}-${x.leaseId}`} value={i}>{x.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-start">Stand am (Beginn)</Label>
              <Input id="st-start" type="date" value={start} onChange={(e) => { setStart(e.target.value); setPreview(null); }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-end">Stand am (Ende)</Label>
              <Input id="st-end" type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPreview(null); }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Abgerechnet wird der Verbrauch zwischen den Zählerständen an beiden Tagen. Fehlt an einem Tag ein Stand, wird zwischen den nächsten Ablesungen anteilig gerechnet.</p>
          <Button type="button" size="sm" variant="outline" onClick={runPreview} disabled={isPending}>Vorschau berechnen</Button>

          {preview && !preview.ok && (
            <p className="flex items-start gap-1.5 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{preview.error}</p>
          )}
          {preview && preview.ok && (
            <div className="space-y-2">
              <ul className="divide-y rounded-lg border text-sm">
                {preview.lines.map((l, i) => (
                  <li key={i} className="px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{l.meterName}{l.estimated ? " (Schätzung)" : ""}</span>
                      <span className="tabular-nums">{formatMoney(l.cents)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {d(l.from)} – {d(dayBefore(l.to))} · {l.startValue != null ? `${l.startValue.toLocaleString("de-DE")} → ${l.endValue!.toLocaleString("de-DE")} · ` : ""}
                      {l.kwh.toLocaleString("de-DE")} kWh × {l.ctPerKwh.toLocaleString("de-DE")} ct{l.interpolated ? " · Stand anteilig ermittelt" : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{preview.kwh.toLocaleString("de-DE")} kWh · <strong>{formatMoney(preview.cents)}</strong></span>
                <Button type="button" size="sm" onClick={create} disabled={isPending}>Abrechnung erstellen</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
