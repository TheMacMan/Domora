"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { updatePaymentAction } from "@/server/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toCents, formatMoney } from "@/lib/money";

type Props = {
  paymentId: string;
  sollCents: number;
  defaultValues: { paidEur: number | undefined; paidAt: string; notes: string };
};

export function PaymentEditForm({ paymentId, sollCents, defaultValues }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const paidEurStr = fd.get("paidEur") as string;
    const paidAt = (fd.get("paidAt") as string) || null;
    const notes = (fd.get("notes") as string) || null;
    const paidCents = paidEurStr !== "" ? toCents(Number(paidEurStr)) : null;

    startTransition(async () => {
      const result = await updatePaymentAction(paymentId, { paidCents, paidAt, notes });
      if (!result.ok) {
        toast.error(result.error);
        setError(result.error);
        return;
      }
      toast.success("Zahlung gespeichert");
      router.push("/payments");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      {error && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Soll-Betrag: </span>
        <span className="font-medium tabular-nums">{formatMoney(sollCents)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="paidEur">Eingegangener Betrag (€)</Label>
        <Input
          id="paidEur"
          name="paidEur"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaultValues.paidEur}
          placeholder="0.00"
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="paidAt">Zahlungsdatum</Label>
        <Input id="paidAt" name="paidAt" type="date" defaultValue={defaultValues.paidAt} disabled={isPending} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notizen</Label>
        <Textarea id="notes" name="notes" defaultValue={defaultValues.notes} rows={3} disabled={isPending} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>Speichern</Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/payments")}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
