"use client";

import { useTransition, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { expenseSchema, type ExpenseFormInput } from "@/lib/validators/expense";
import { createExpenseAction, updateExpenseAction } from "@/server/actions/expenses";
import { CATEGORY_LABELS as CATEGORY_LABELS_LIB, CATEGORY_GROUPS } from "@/lib/expense";
import { formatMonthLong, todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Re-Export für bestehende Imports (z.B. aus expense-form-internen Komponenten)
export const CATEGORY_LABELS = CATEGORY_LABELS_LIB;

type Property = { id: string; street: string; city: string };

type Props =
  | { mode: "create"; properties: Property[] }
  | { mode: "edit"; expenseId: string; defaultValues: ExpenseFormInput; properties: Property[] };

export function ExpenseForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    setError,
  } = useForm<ExpenseFormInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: props.mode === "edit" ? props.defaultValues : {
      isRecurring: false,
      date: todayLocal(),
    },
  });

  const category = watch("category");
  const amountEur = watch("amountEur");
  const periodStart = watch("servicePeriodStart");
  const periodEnd = watch("servicePeriodEnd");
  const isGrundsteuer = category === "bk_grundsteuer";

  // Lokales Year-Input, damit Teil-Eingaben (z.B. "2") nicht sofort
  // den Date-Wert auf "2-01-01" setzen und Validierung triggern.
  const initialYear =
    props.mode === "edit"
      ? props.defaultValues.date?.slice(0, 4) ?? String(new Date().getFullYear())
      : String(new Date().getFullYear());
  const [yearInput, setYearInput] = useState(initialYear);

  useEffect(() => {
    if (isGrundsteuer) {
      const currentDate = watch("date");
      const year = currentDate?.slice(0, 4) ?? String(new Date().getFullYear());
      setYearInput(year);
      setValue("date", `${year}-01-01`);
    }
  }, [isGrundsteuer]);

  function handleYearChange(v: string) {
    // Nur Ziffern, max. 4 Stellen erlauben (auch leer)
    const cleaned = v.replace(/\D/g, "").slice(0, 4);
    setYearInput(cleaned);
    if (/^\d{4}$/.test(cleaned)) {
      setValue("date", `${cleaned}-01-01`, { shouldValidate: true });
    }
  }

  const onSubmit = (data: ExpenseFormInput) => {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createExpenseAction(data)
          : await updateExpenseAction(props.expenseId, data);

      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      toast.success("Gespeichert");
      router.push("/expenses");
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {errors.root && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {errors.root.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">{isGrundsteuer ? "Jahr" : "Datum"}</Label>
          {isGrundsteuer ? (
            <Input
              id="date"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder={String(new Date().getFullYear())}
              value={yearInput}
              onChange={(e) => handleYearChange(e.target.value)}
              disabled={isPending}
            />
          ) : (
            <Input id="date" type="date" {...register("date")} disabled={isPending} />
          )}
          {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="amountEur">Betrag</Label>
          <div className="relative">
            <Input
              id="amountEur"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              {...register("amountEur", { valueAsNumber: true })}
              disabled={isPending}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
          </div>
          {errors.amountEur && <p className="text-xs text-destructive">{errors.amountEur.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Kategorie (Anlage V)</Label>
          <select
            id="category"
            {...register("category")}
            disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.categories.map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="propertyId">Objekt</Label>
          <select
            id="propertyId"
            {...register("propertyId")}
            disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">Alle Objekte (anteilig)</option>
            {props.properties.map((p) => (
              <option key={p.id} value={p.id}>{p.street}, {p.city}</option>
            ))}
          </select>
          {errors.propertyId && <p className="text-xs text-destructive">{errors.propertyId.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">
          Beschreibung <span className="text-muted-foreground font-normal">– empfohlen</span>
        </Label>
        <Input
          id="description"
          {...register("description")}
          placeholder="z. B. Dachreparatur, Jahresprämie Gebäudeversicherung"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          Falls leer, wird in der Übersicht der Kategoriename angezeigt.
        </p>
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isRecurring"
          type="checkbox"
          {...register("isRecurring")}
          disabled={isPending}
          className="rounded"
        />
        <Label htmlFor="isRecurring" className="cursor-pointer font-normal">
          Wiederkehrende Ausgabe (z. B. Versicherung, Grundsteuer)
        </Label>
      </div>

      {/* Leistungszeitraum — nicht für Grundsteuer (impliziter Jahresbezug) */}
      {!isGrundsteuer ? (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div>
            <Label className="text-sm font-medium">Leistungszeitraum <span className="text-muted-foreground font-normal">– optional</span></Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Für Jahresrechnungen wie Strom oder Gas. Im Cashflow wird der Betrag auf die Monate im Zeitraum verteilt.
            </p>
          </div>

          {/* Schnellauswahl: ganzes Jahr */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">Schnellauswahl:</span>
            {(() => {
              const cy = new Date().getFullYear();
              return [cy - 1, cy, cy + 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setValue("servicePeriodStart", `${y}-01-01`, { shouldValidate: true });
                    setValue("servicePeriodEnd", `${y}-12-31`, { shouldValidate: true });
                  }}
                  disabled={isPending}
                  className="rounded-md border px-2 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Ganzes Jahr {y}
                </button>
              ));
            })()}
            <button
              type="button"
              onClick={() => {
                setValue("servicePeriodStart", "", { shouldValidate: true });
                setValue("servicePeriodEnd", "", { shouldValidate: true });
              }}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-auto"
            >
              Leeren
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="servicePeriodStart" className="text-xs">Von</Label>
              <Input id="servicePeriodStart" type="date" {...register("servicePeriodStart")} disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="servicePeriodEnd" className="text-xs">Bis</Label>
              <Input id="servicePeriodEnd" type="date" {...register("servicePeriodEnd")} disabled={isPending} />
              {errors.servicePeriodEnd && <p className="text-xs text-destructive">{errors.servicePeriodEnd.message}</p>}
            </div>
          </div>

          {/* Verteilungs-Vorschau */}
          {(() => {
            if (!periodStart || !periodEnd || !amountEur || amountEur <= 0) return null;
            if (periodStart > periodEnd) return null;
            const [sy, sm] = periodStart.split("-").map(Number) as [number, number];
            const [ey, em] = periodEnd.split("-").map(Number) as [number, number];
            const totalMonths = (ey - sy) * 12 + (em - sm) + 1;
            if (totalMonths <= 0) return null;
            const totalCents = Math.round(amountEur * 100);
            const perMonthCents = Math.round(totalCents / totalMonths);
            // Liste der Monate aufbauen
            const months: string[] = [];
            let y = sy, m = sm;
            for (let i = 0; i < totalMonths && i < 36; i++) {
              months.push(`${y}-${String(m).padStart(2, "0")}`);
              m++;
              if (m > 12) { m = 1; y++; }
            }
            return (
              <details className="rounded-md border bg-background p-3 text-xs">
                <summary className="cursor-pointer text-foreground/85">
                  Cashflow-Verteilung: <span className="font-medium">{totalMonths}</span> ×{" "}
                  <span className="font-medium tabular-nums">{formatMoney(perMonthCents)}</span>{" "}
                  <span className="text-muted-foreground">({totalMonths > 36 ? "ersten 36 Monate anzeigen" : "alle Monate anzeigen"})</span>
                </summary>
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 mt-3">
                  {months.map((ym) => (
                    <li key={ym} className="flex justify-between text-muted-foreground">
                      <span>{formatMonthLong(ym)}</span>
                      <span className="tabular-nums">{formatMoney(perMonthCents)}</span>
                    </li>
                  ))}
                </ul>
                {totalMonths > 36 && (
                  <p className="text-muted-foreground mt-2 italic">… und {totalMonths - 36} weitere Monate</p>
                )}
              </details>
            );
          })()}
        </div>
      ) : (
        <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Cashflow:</strong> Der Betrag wird automatisch über die 12 Monate des gewählten Jahres verteilt.
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">
          Notizen <span className="text-muted-foreground font-normal">– optional</span>
        </Label>
        <Textarea id="notes" {...register("notes")} placeholder="Belegnummer, Anmerkungen…" rows={3} disabled={isPending} />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>
          Speichern
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/expenses")}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
