"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { addReceiptAction, deleteReceiptAction, updatePaymentNotesAction } from "@/server/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, parseEuroInput } from "@/lib/money";
import { formatDate, todayLocal } from "@/lib/dates";

type Receipt = { id: string; receivedAt: string; amountCents: number; note: string | null };

type Props = {
  paymentId: string;
  sollCents: number;
  receipts: Receipt[];
  notes: string;
  /** Zielseite nach "Fertig" — die Zahlungsliste im Monat der Zahlung */
  returnTo: string;
};

export function PaymentEditForm({ paymentId, sollCents, receipts, notes, returnTo }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const receivedCents = receipts.reduce((s, r) => s + r.amountCents, 0);
  const openCents = sollCents - receivedCents;

  const [date, setDate] = useState(todayLocal());
  const [amount, setAmount] = useState(openCents > 0 ? (openCents / 100).toFixed(2).replace(".", ",") : "");
  const [isRefund, setIsRefund] = useState(false);
  const [note, setNote] = useState("");
  const [notesValue, setNotesValue] = useState(notes);

  function addReceipt(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseEuroInput(amount);
    if (cents == null || cents <= 0) {
      toast.error("Bitte einen Betrag größer 0 eingeben.");
      return;
    }
    startTransition(async () => {
      const res = await addReceiptAction(paymentId, isRefund ? -cents : cents, date, note);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isRefund ? "Rückzahlung erfasst" : "Eingang erfasst");
      setAmount("");
      setNote("");
      setIsRefund(false);
    });
  }

  function removeReceipt(r: Receipt) {
    if (!window.confirm(`Eingang vom ${formatDate(r.receivedAt)} über ${formatMoney(r.amountCents)} entfernen?`)) return;
    startTransition(async () => {
      const res = await deleteReceiptAction(r.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Eingang vom ${formatDate(r.receivedAt)} entfernt`);
    });
  }

  function saveNotes() {
    startTransition(async () => {
      const res = await updatePaymentNotesAction(paymentId, notesValue);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Notiz gespeichert");
    });
  }

  return (
    <div className="space-y-6 max-w-md">
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Soll</p>
          <p className="font-medium tabular-nums">{formatMoney(sollCents)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Erhalten</p>
          <p className="font-medium tabular-nums text-green-600">{formatMoney(receivedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{openCents >= 0 ? "Offen" : "Überzahlt"}</p>
          <p className={`font-medium tabular-nums ${openCents > 0 ? "text-destructive" : ""}`}>{formatMoney(Math.abs(openCents))}</p>
        </div>
      </div>

      {/* Eingänge */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Zahlungseingänge</h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein Eingang erfasst.</p>
        ) : (
          <ul className="rounded-lg border divide-y">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <span className="tabular-nums text-sm w-24 shrink-0">{formatDate(r.receivedAt)}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{r.note ?? ""}</span>
                <span className={`tabular-nums text-sm font-medium ${r.amountCents < 0 ? "text-destructive" : ""}`}>
                  {formatMoney(r.amountCents)}
                </span>
                <button
                  type="button"
                  onClick={() => removeReceipt(r)}
                  disabled={isPending}
                  className="size-10 -my-1 -mr-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  aria-label={`Eingang vom ${formatDate(r.receivedAt)} entfernen`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addReceipt} className="rounded-lg border p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Eingang hinzufügen</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label htmlFor="r-date">Datum</Label>
              <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-amount">Betrag (€)</Label>
              <Input id="r-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="550,00" disabled={isPending} className="h-10 text-base md:h-9 md:text-sm" />
            </div>
          </div>
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notiz (optional), z. B. Zahler oder Verwendungszweck"
            disabled={isPending}
            className="h-10 text-base md:h-9 md:text-sm"
          />
          <label className="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" checked={isRefund} onChange={(e) => setIsRefund(e.target.checked)} disabled={isPending} className="size-4" />
            Rückzahlung an Mieter (z. B. Überzahlung)
          </label>
          <Button type="submit" size="sm" loading={isPending}>
            <Plus className="size-4" />
            {isRefund ? "Rückzahlung erfassen" : "Eingang erfassen"}
          </Button>
        </form>
      </section>

      {/* Notiz */}
      <section className="space-y-2">
        <Label htmlFor="notes">Notiz zum Monat</Label>
        <Textarea id="notes" value={notesValue} onChange={(e) => setNotesValue(e.target.value)} rows={3} disabled={isPending} />
        {notesValue !== notes && (
          <Button type="button" size="sm" variant="outline" onClick={saveNotes} disabled={isPending}>
            Notiz speichern
          </Button>
        )}
      </section>

      <Button type="button" variant="outline" onClick={() => router.replace(returnTo)} disabled={isPending}>
        Fertig
      </Button>
    </div>
  );
}
