"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { formatMoney, toEuros } from "@/lib/money";
import { setLoanInterestYearAction, deleteLoanInterestYearAction } from "@/server/actions/loans";

type Entry = { id: string; year: number; interestCents: number };

export function LoanInterestYears({ loanId, entries }: { loanId: string; entries: Entry[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [amount, setAmount] = useState("");

  const sorted = [...entries].sort((a, b) => b.year - a.year);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const y = parseInt(year, 10);
    const eur = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isInteger(y) || y < 1990 || y > 2100) {
      toast.error("Bitte gültiges Jahr eingeben.");
      return;
    }
    if (!Number.isFinite(eur) || eur < 0) {
      toast.error("Bitte gültigen Zinsbetrag eingeben.");
      return;
    }
    startTransition(async () => {
      const res = await setLoanInterestYearAction(loanId, y, eur);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Schuldzinsen ${y} gespeichert`);
      setAmount("");
      router.refresh();
    });
  }

  function remove(id: string, y: number) {
    startTransition(async () => {
      const res = await deleteLoanInterestYearAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Eintrag ${y} gelöscht`);
      router.refresh();
    });
  }

  function edit(entry: Entry) {
    setYear(String(entry.year));
    setAmount(toEuros(entry.interestCents).toFixed(2).replace(".", ","));
  }

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-primary" />
        <h2 className="text-base font-semibold">Schuldzinsen lt. Zinsbescheinigung</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Die von der Bank bescheinigten Jahres-Schuldzinsen. Ein erfasstes Jahr hat in der{" "}
        <span className="font-medium">Anlage V</span> Vorrang vor den aus dem Tilgungsplan
        berechneten (Näherungs-)Zinsen. Ohne Eintrag wird weiterhin der Tilgungsplan verwendet.
      </p>

      {sorted.length > 0 && (
        <div className="rounded-lg border divide-y">
          {sorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 group">
              <button
                type="button"
                onClick={() => edit(e)}
                className="flex items-baseline gap-3 text-left hover:opacity-80 transition-opacity"
                title="Zum Bearbeiten laden"
              >
                <span className="font-medium tabular-nums w-12">{e.year}</span>
                <span className="tabular-nums">{formatMoney(e.interestCents)}</span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                disabled={isPending}
                onClick={() => remove(e.id, e.year)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="liy-year">Jahr</Label>
          <Input
            id="liy-year"
            type="number"
            inputMode="numeric"
            value={year}
            onChange={(ev) => setYear(ev.target.value)}
            disabled={isPending}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="liy-amount">Schuldzinsen</Label>
          <div className="relative">
            <Input
              id="liy-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              placeholder="z. B. 4.312,55"
              disabled={isPending}
              className="w-40 pr-7"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
          </div>
        </div>
        <Button type="submit" size="sm" loading={isPending} disabled={!year || !amount}>
          <Plus className="size-4" />
          Speichern
        </Button>
      </form>
    </section>
  );
}
