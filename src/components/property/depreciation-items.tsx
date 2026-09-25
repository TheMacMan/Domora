"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, parseEuroInput } from "@/lib/money";
import {
  createDepreciationItemAction,
  updateDepreciationItemAction,
  deleteDepreciationItemAction,
} from "@/server/actions/properties";

type Item = {
  id: string;
  method: "linear" | "degressive";
  rateBps: number | null;
  basisMode: "prior_year" | "explanation";
  explanation: string | null;
  annualCents: number;
  fromYear: number | null;
  toYear: number | null;
};

type Draft = {
  method: "linear" | "degressive";
  rate: string;
  basisMode: "prior_year" | "explanation";
  explanation: string;
  amount: string;
  fromYear: string;
  toYear: string;
};

const EMPTY: Draft = { method: "linear", rate: "", basisMode: "prior_year", explanation: "", amount: "", fromYear: "", toYear: "" };

const METHOD_LABEL = { linear: "linear", degressive: "degressiv" } as const;
const BASIS_LABEL = { prior_year: "wie Vorjahr", explanation: "laut Erläuterung" } as const;

function fmtRate(bps: number) {
  return (bps / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

// AfA-Posten eines Objekts — Aufbau wie ELSTER Anlage V, Zeile 33.
export function DepreciationItems({ propertyId, items }: { propertyId: string; items: Item[] }) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const total = items.reduce((s, i) => s + i.annualCents, 0);
  const currentYear = new Date().getFullYear();

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function openNew() {
    setDraft(EMPTY);
    setEditingId("new");
  }

  function openEdit(i: Item) {
    setDraft({
      method: i.method,
      rate: i.rateBps != null ? (i.rateBps / 100).toFixed(2).replace(".", ",") : "",
      basisMode: i.basisMode,
      explanation: i.explanation ?? "",
      amount: (i.annualCents / 100).toFixed(2).replace(".", ","),
      fromYear: i.fromYear != null ? String(i.fromYear) : "",
      toYear: i.toYear != null ? String(i.toYear) : "",
    });
    setEditingId(i.id);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseEuroInput(draft.amount);
    if (amountCents == null || amountCents < 0) {
      toast.error("Bitte den AfA-Betrag pro Jahr eingeben.");
      return;
    }
    const rate = draft.rate.trim() ? Number(draft.rate.replace(",", ".")) : undefined;
    if (rate != null && (!Number.isFinite(rate) || rate <= 0)) {
      toast.error("Prozent bitte als Zahl eingeben, z. B. 2,00.");
      return;
    }
    const data = {
      method: draft.method,
      ratePercent: rate,
      basisMode: draft.basisMode,
      explanation: draft.explanation,
      annualEur: amountCents / 100,
      fromYear: draft.fromYear.trim() ? parseInt(draft.fromYear, 10) : undefined,
      toYear: draft.toYear.trim() ? parseInt(draft.toYear, 10) : undefined,
    };
    startTransition(async () => {
      const res = editingId === "new"
        ? await createDepreciationItemAction(propertyId, data)
        : await updateDepreciationItemAction(editingId!, data);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("AfA-Posten gespeichert");
      setEditingId(null);
    });
  }

  function remove(i: Item) {
    if (!window.confirm(`AfA-Posten über ${formatMoney(i.annualCents)} entfernen?`)) return;
    startTransition(async () => {
      const res = await deleteDepreciationItemAction(i.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("AfA-Posten entfernt");
      if (editingId === i.id) setEditingId(null);
    });
  }

  const segBtn = (active: boolean) =>
    `h-9 px-3 rounded text-sm font-medium transition-colors ${active ? "bg-background shadow-sm" : "text-muted-foreground"}`;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine AfA-Posten. Übernimm die Posten aus der letzten Anlage V (Zeile 33) — dann rechnet die App mit genau diesen Beträgen.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((i) => {
            const inactive = (i.fromYear != null && i.fromYear > currentYear) || (i.toYear != null && i.toYear < currentYear);
            return (
              <li key={i.id} className={`px-3 py-2.5 ${inactive ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {METHOD_LABEL[i.method]}
                      {i.rateBps != null && <> · {fmtRate(i.rateBps)}</>}
                      <span className="text-muted-foreground font-normal"> · {BASIS_LABEL[i.basisMode]}</span>
                    </p>
                    {(i.fromYear != null || i.toYear != null) && (
                      <p className="text-xs text-muted-foreground">
                        {i.fromYear != null ? `ab ${i.fromYear}` : ""}{i.fromYear != null && i.toYear != null ? " " : ""}{i.toYear != null ? `bis ${i.toYear}` : ""}
                      </p>
                    )}
                    {i.explanation && (
                      <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">{i.explanation}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="tabular-nums font-semibold text-sm mr-1">{formatMoney(i.annualCents)}</span>
                    <button
                      type="button"
                      onClick={() => openEdit(i)}
                      disabled={isPending}
                      className="size-10 -my-1 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      aria-label="AfA-Posten bearbeiten"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={isPending}
                      className="size-10 -my-1 -mr-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      aria-label="AfA-Posten entfernen"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          <li className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
            <span className="text-sm font-semibold">Summe AfA pro Jahr</span>
            <span className="tabular-nums font-bold">{formatMoney(total)}</span>
          </li>
        </ul>
      )}

      {editingId === null ? (
        <Button type="button" size="sm" variant="outline" onClick={openNew}>
          <Plus className="size-4" />
          AfA-Posten hinzufügen
        </Button>
      ) : (
        <form onSubmit={save} className="rounded-lg border p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {editingId === "new" ? "Neuer AfA-Posten" : "AfA-Posten bearbeiten"} (wie ELSTER, Zeile 33)
          </p>

          <div className="space-y-1.5">
            <Label>Art der Absetzung für Abnutzung</Label>
            <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1 sm:inline-grid sm:w-auto">
              {(["linear", "degressive"] as const).map((m) => (
                <button key={m} type="button" onClick={() => set("method", m)} className={segBtn(draft.method === m)}>
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Absetzung für Abnutzung</Label>
            <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1 sm:inline-grid sm:w-auto">
              {(["prior_year", "explanation"] as const).map((b) => (
                <button key={b} type="button" onClick={() => set("basisMode", b)} className={segBtn(draft.basisMode === b)}>
                  {BASIS_LABEL[b]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="afa-rate">Prozent (optional)</Label>
              <Input id="afa-rate" type="text" inputMode="decimal" value={draft.rate} onChange={(e) => set("rate", e.target.value)} placeholder="2,00" disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="afa-amount">Werbungskosten / Jahr (€)</Label>
              <Input id="afa-amount" type="text" inputMode="decimal" value={draft.amount} onChange={(e) => set("amount", e.target.value)} placeholder="4.868" disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
            </div>
          </div>

          {draft.basisMode === "explanation" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="afa-expl">Erläuterung</Label>
              <Textarea id="afa-expl" value={draft.explanation} onChange={(e) => set("explanation", e.target.value)} rows={4} placeholder="z. B. Ermittlung der Anschaffungskosten …" disabled={isPending} className="text-base md:text-sm" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="afa-from">Gilt ab Jahr (optional)</Label>
              <Input id="afa-from" type="number" inputMode="numeric" value={draft.fromYear} onChange={(e) => set("fromYear", e.target.value)} placeholder="immer" disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="afa-to">Gilt bis Jahr (optional)</Label>
              <Input id="afa-to" type="number" inputMode="numeric" value={draft.toYear} onChange={(e) => set("toYear", e.target.value)} placeholder="offen" disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isPending}>Speichern</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={isPending}>Abbrechen</Button>
          </div>
        </form>
      )}
    </div>
  );
}
