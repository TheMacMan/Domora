"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { addNkSettlementReceiptAction, deleteReceiptAction } from "@/server/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, parseEuroInput } from "@/lib/money";
import { formatDate, todayLocal } from "@/lib/dates";

type Receipt = { id: string; settlementYear: number | null; receivedAt: string; amountCents: number; note: string | null };

type Props = {
  leaseId: string;
  receipts: Receipt[];
  /** Fest vorgegebenes Abrechnungsjahr (NK-Abrechnung) — sonst wählbar (Mietkonto) */
  fixedYear?: number;
  /** Vorbelegung aus dem Abrechnungssaldo: > 0 Nachzahlung, < 0 Erstattung */
  suggestedCents?: number;
};

// NK-Nachzahlung vom Mieter (+) bzw. Erstattung an den Mieter (−) mit Datum —
// fließt nach Eingangsdatum in die Anlage V (Umlagen).
export function NkSettlementReceipts({ leaseId, receipts, fixedYear, suggestedCents }: Props) {
  const [isPending, startTransition] = useTransition();
  const [year, setYear] = useState(String(fixedYear ?? new Date().getFullYear() - 1));
  const [date, setDate] = useState(todayLocal());
  const [direction, setDirection] = useState<"in" | "out">(suggestedCents != null && suggestedCents < 0 ? "out" : "in");
  const [amount, setAmount] = useState(
    suggestedCents != null && suggestedCents !== 0 ? (Math.abs(suggestedCents) / 100).toFixed(2).replace(".", ",") : "",
  );

  function add(e: React.FormEvent) {
    e.preventDefault();
    const y = parseInt(year, 10);
    const cents = parseEuroInput(amount);
    if (!Number.isInteger(y)) { toast.error("Bitte Abrechnungsjahr angeben."); return; }
    if (cents == null || cents <= 0) { toast.error("Bitte einen Betrag größer 0 eingeben."); return; }
    startTransition(async () => {
      const res = await addNkSettlementReceiptAction(leaseId, y, direction === "in" ? cents : -cents, date);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(direction === "in" ? "Nachzahlung erfasst" : "Erstattung erfasst");
      setAmount("");
    });
  }

  function remove(r: Receipt) {
    if (!window.confirm(`${r.amountCents >= 0 ? "Nachzahlung" : "Erstattung"} vom ${formatDate(r.receivedAt)} über ${formatMoney(r.amountCents)} entfernen?`)) return;
    startTransition(async () => {
      const res = await deleteReceiptAction(r.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Eintrag entfernt");
    });
  }

  return (
    <div className="space-y-3">
      {receipts.length > 0 && (
        <ul className="rounded-lg border divide-y">
          {receipts.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="tabular-nums w-24 shrink-0">{formatDate(r.receivedAt)}</span>
              <span className="flex-1 text-xs text-muted-foreground truncate">
                NK {r.settlementYear} · {r.amountCents >= 0 ? "Nachzahlung" : "Erstattung"}
              </span>
              <span className={`tabular-nums font-medium ${r.amountCents < 0 ? "text-destructive" : "text-green-600"}`}>
                {formatMoney(r.amountCents)}
              </span>
              <button
                type="button"
                onClick={() => remove(r)}
                disabled={isPending}
                className="size-10 -my-1 -mr-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                aria-label="Eintrag entfernen"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="rounded-lg border p-3 space-y-3">
        {/* Richtung: auf dem iPhone volle Breite, zwei gleich breite Hälften */}
        <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1 sm:inline-grid sm:w-auto">
          {(["in", "out"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`h-9 px-3 rounded text-sm font-medium transition-colors ${direction === d ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {d === "in" ? "Nachzahlung" : "Erstattung"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          {direction === "in" ? "Mieter zahlt an dich nach." : "Du erstattest dem Mieter."}
        </p>
        {/* iPhone: max. 2 Spalten, damit das iOS-Datumsfeld nicht abgeschnitten wird */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {!fixedYear && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nk-year-${leaseId}`}>NK-Jahr</Label>
              <Input id={`nk-year-${leaseId}`} type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-0">
            <Label htmlFor={`nk-date-${leaseId}`}>Datum</Label>
            <Input id={`nk-date-${leaseId}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
          </div>
          <div className={`flex flex-col gap-1.5 ${!fixedYear ? "col-span-2 sm:col-span-1" : ""}`}>
            <Label htmlFor={`nk-amount-${leaseId}`}>Betrag (€)</Label>
            <Input id={`nk-amount-${leaseId}`} type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
          </div>
        </div>
        <Button type="submit" size="sm" loading={isPending}>
          <Plus className="size-4" />
          Zahlung erfassen
        </Button>
      </form>
    </div>
  );
}
