"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pencil, Plus, X, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, parseEuroInput } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { ConsumptionMedium } from "@/db/schema";
import { buildConsumptionSeries, MEDIUM_META, MEDIA, type ConsumptionPeriod, type ConsumptionRow } from "@/lib/consumption";
import {
  createConsumptionPeriodAction,
  updateConsumptionPeriodAction,
  deleteConsumptionPeriodAction,
} from "@/server/actions/consumption";

type Draft = {
  medium: ConsumptionMedium;
  periodStart: string;
  periodEnd: string;
  quantity: string;
  cost: string;
  advance: string;
  note: string;
};

const EMPTY: Draft = { medium: "gas", periodStart: "", periodEnd: "", quantity: "", cost: "", advance: "", note: "" };

const BAR: Record<ConsumptionMedium, string> = {
  gas: "bg-orange-500/80",
  heating: "bg-red-500/70",
  electricity: "bg-yellow-500/80",
  hotwater: "bg-rose-400/80",
  water: "bg-sky-500/80",
  wastewater: "bg-slate-500/70",
};

function fmtQty(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: n < 100 ? 1 : 0 });
}

function euroField(cents: number | null) {
  return cents != null ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct > 0;
  const strong = Math.abs(pct) >= 20;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 ${strong ? (up ? "text-destructive font-semibold" : "text-green-600 font-semibold") : "text-muted-foreground"}`}>
      <Icon className="size-3" />
      {up ? "+" : ""}{pct.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %
    </span>
  );
}

// Verbrauchsentwicklung eines Objekts: Mengen, Kosten und Abschläge je Abrechnungszeitraum.
export function ConsumptionSection({ propertyId, periods }: { propertyId: string; periods: ConsumptionPeriod[] }) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  // Wo das Formular für einen neuen Zeitraum erscheint: im jeweiligen Medium oder unten
  const [newIn, setNewIn] = useState<ConsumptionMedium | "bottom">("bottom");
  const formRef = useRef<HTMLFormElement>(null);

  // Geöffnetes Formular in den sichtbaren Bereich holen
  useEffect(() => {
    if (editingId !== null) formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [editingId, newIn]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const series = useMemo(() => buildConsumptionSeries(periods), [periods]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function openNew(medium?: ConsumptionMedium) {
    setDraft({ ...EMPTY, medium: medium ?? EMPTY.medium });
    setNewIn(medium ?? "bottom");
    setEditingId("new");
  }

  function openEdit(r: ConsumptionRow) {
    setDraft({
      medium: r.medium,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      quantity: String(r.quantity).replace(".", ","),
      cost: euroField(r.costCents),
      advance: euroField(r.advanceCents),
      note: r.note ?? "",
    });
    setEditingId(r.id);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(draft.quantity.replace(/\./g, "").replace(",", "."));
    if (!draft.quantity.trim() || !Number.isFinite(quantity) || quantity < 0) {
      toast.error("Bitte den Verbrauch als Zahl eingeben.");
      return;
    }
    const cost = draft.cost.trim() ? parseEuroInput(draft.cost) : null;
    const advance = draft.advance.trim() ? parseEuroInput(draft.advance) : null;
    if ((draft.cost.trim() && cost == null) || (draft.advance.trim() && advance == null)) {
      toast.error("Beträge bitte als Zahl eingeben, z. B. 1.064,65.");
      return;
    }
    const data = {
      medium: draft.medium,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      quantity,
      costEur: cost != null ? cost / 100 : undefined,
      advanceEur: advance != null ? advance / 100 : undefined,
      note: draft.note,
    };
    startTransition(async () => {
      const res = editingId === "new"
        ? await createConsumptionPeriodAction(propertyId, data)
        : await updateConsumptionPeriodAction(editingId!, data);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Verbrauch gespeichert");
      setEditingId(null);
    });
  }

  function remove(r: ConsumptionRow) {
    if (!window.confirm(`${MEDIUM_META[r.medium].label} ${formatDate(r.periodStart)}–${formatDate(r.periodEnd)} entfernen?`)) return;
    startTransition(async () => {
      const res = await deleteConsumptionPeriodAction(r.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Eintrag entfernt");
      if (editingId === r.id) setEditingId(null);
    });
  }

  const segBtn = (active: boolean) =>
    `h-9 px-3 rounded text-sm font-medium transition-colors ${active ? "bg-background shadow-sm" : "text-muted-foreground"}`;

  const formEl = (
      <form ref={formRef} onSubmit={save} className="space-y-3 rounded-lg border bg-background p-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {editingId === "new" ? "Neuer Abrechnungszeitraum" : "Abrechnungszeitraum bearbeiten"}
        </p>
  
        <div className="space-y-1.5">
          <Label>Medium</Label>
          <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1 sm:inline-grid sm:w-auto sm:grid-cols-3">
            {MEDIA.map((m) => (
              <button key={m} type="button" className={segBtn(draft.medium === m)} onClick={() => set("medium", m)}>
                {MEDIUM_META[m].label}
              </button>
            ))}
          </div>
        </div>
  
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-start">Zeitraum von</Label>
            <Input id="cp-start" type="date" required value={draft.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-end">bis</Label>
            <Input id="cp-end" type="date" required value={draft.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
          </div>
        </div>
  
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-qty">Verbrauch ({MEDIUM_META[draft.medium].unit})</Label>
            <Input id="cp-qty" inputMode="decimal" required value={draft.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="z. B. 50882" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-cost">Kosten (€) <span className="font-normal text-muted-foreground">– optional</span></Label>
            <Input id="cp-cost" inputMode="decimal" value={draft.cost} onChange={(e) => set("cost", e.target.value)} placeholder="lt. Abrechnung" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-adv">Abschläge (€) <span className="font-normal text-muted-foreground">– optional</span></Label>
            <Input id="cp-adv" inputMode="decimal" value={draft.advance} onChange={(e) => set("advance", e.target.value)} placeholder="bezahlt" />
          </div>
        </div>
  
        <div className="space-y-1.5">
          <Label htmlFor="cp-note">Notiz <span className="font-normal text-muted-foreground">– optional</span></Label>
          <Input id="cp-note" value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="z. B. Versorger, Rechnungsnummer" />
        </div>
  
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={isPending}>Speichern</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={isPending}>
            Abbrechen
          </Button>
        </div>
      </form>
  );

  return (
    <div className="space-y-4">
      {series.length === 0 && editingId === null && (
        <p className="text-sm text-muted-foreground">
          Noch keine Verbrauchsdaten. Trage je Abrechnung Zeitraum, Verbrauch, Kosten und die bezahlten Abschläge ein —
          dann siehst du die Entwicklung über die Jahre und ob die Abschläge passen.
        </p>
      )}

      {series.map((s) => (
        <div key={s.medium} className="rounded-lg border">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <p className="text-sm font-semibold">{s.label} <span className="font-normal text-muted-foreground">({s.unit})</span></p>
            <Button type="button" size="sm" variant="ghost" onClick={() => openNew(s.medium)} disabled={isPending}>
              <Plus className="size-4" />
              Zeitraum
            </Button>
          </div>
          {editingId === "new" && newIn === s.medium && <div className="border-b p-3">{formEl}</div>}
          <ul className="divide-y">
            {s.rows.map((r) => (
              <li key={r.id} className="px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-sm font-semibold tabular-nums">{r.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="h-4 rounded bg-muted/40">
                      <div
                        className={`h-4 rounded ${BAR[r.medium]}`}
                        style={{ width: `${s.maxQuantity > 0 ? Math.max(2, (r.quantity / s.maxQuantity) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {fmtQty(r.quantity)} {s.unit}
                  </span>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      disabled={isPending}
                      className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      aria-label="Eintrag bearbeiten"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={isPending}
                      className="-mr-2 size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Eintrag entfernen"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-1 ml-13 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                  <span>{formatDate(r.periodStart)}–{formatDate(r.periodEnd)} ({r.days} Tage)</span>
                  <ChangeBadge pct={r.changePct} />
                  {r.costCents != null && (
                    <span>
                      Kosten {formatMoney(r.costCents)}
                      {r.costPerUnitCents != null && ` · ${(r.costPerUnitCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: s.unit === "kWh" ? 3 : 2 })} €/${s.unit}`}
                    </span>
                  )}
                  {r.balanceCents != null && (
                    <span className={r.balanceCents >= 0 ? "text-green-600" : "text-destructive"}>
                      {r.balanceCents >= 0 ? "Guthaben" : "Nachzahlung"} {formatMoney(Math.abs(r.balanceCents))}
                      {r.advanceCents != null && r.advanceCents > 0 && ` (${Math.round((Math.abs(r.balanceCents) / r.advanceCents) * 100)} % der Abschläge)`}
                    </span>
                  )}
                  {r.note && <span className="basis-full break-words">{r.note}</span>}
                </div>
                {editingId === r.id && <div className="mt-3">{formEl}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {editingId === null ? (
        <Button type="button" size="sm" variant="outline" onClick={() => openNew()}>
          <Plus className="size-4" />
          Verbrauch erfassen
        </Button>
      ) : editingId === "new" && newIn === "bottom" ? (
        formEl
      ) : null}
    </div>
  );
}
