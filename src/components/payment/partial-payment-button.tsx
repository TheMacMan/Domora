"use client";

import { todayLocal } from "@/lib/dates";
import { useState, useTransition, useId } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { addPartialPaymentAction } from "@/server/actions/payments";
import { toCents } from "@/lib/money";

type Props = {
  paymentId: string;
  defaultAmountEur?: number; // z.B. offener Restbetrag
  /** Periodenanfang (YYYY-MM-DD) für Datumsvorbelegung. Fallback: heute. */
  defaultReceivedAt?: string;
};

export function PartialPaymentButton({ paymentId, defaultAmountEur, defaultReceivedAt }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const amountId = useId();
  const dateId = useId();

  function handleSubmit(formData: FormData) {
    const amountStr = (formData.get("amount") as string).replace(",", ".");
    const amount = Number(amountStr);
    const receivedAt = formData.get("receivedAt") as string;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Bitte Betrag > 0 eingeben.");
      return;
    }
    startTransition(async () => {
      const result = await addPartialPaymentAction(paymentId, toCents(amount), receivedAt);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Teilzahlung erfasst");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen(true)}
        title="Teilzahlung erfassen"
      >
        <Plus className="size-3" />
        Teilzahlung
      </Button>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-center gap-1">
      <div className="relative">
        <Input
          id={amountId}
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          defaultValue={defaultAmountEur != null ? defaultAmountEur.toFixed(2) : ""}
          placeholder="0,00"
          autoFocus
          disabled={isPending}
          className="h-9 w-24 pr-6 text-base md:h-7 md:text-xs"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
      </div>
      <Input
        id={dateId}
        name="receivedAt"
        type="date"
        defaultValue={defaultReceivedAt ?? todayLocal()}
        disabled={isPending}
        className="h-9 w-32 text-base md:h-7 md:text-xs"
      />
      <Button type="submit" size="sm" loading={isPending} className="h-9 md:h-7 text-xs">
        OK
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 md:size-7"
        onClick={() => setOpen(false)}
        disabled={isPending}
      >
        <X className="size-3.5" />
      </Button>
    </form>
  );
}
