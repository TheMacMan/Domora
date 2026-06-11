"use client";

import { todayLocal } from "@/lib/dates";
import { useTransition, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { loanSchema, type LoanFormInput, type LoanType } from "@/lib/validators/loan";
import { createLoanAction, updateLoanAction } from "@/server/actions/loans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoanBausparFields } from "./loan-bauspar-fields";
import { cn } from "@/lib/utils";

type Property = { id: string; street: string; city: string };
type BausparOption = { id: string; description: string };

type Props =
  | { mode: "create"; properties: Property[]; bausparLoans: BausparOption[] }
  | { mode: "edit"; loanId: string; defaultValues: LoanFormInput; properties: Property[]; bausparLoans: BausparOption[] };

type RateMode = "direct" | "from_payment";

const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  annuity: "Annuitätendarlehen",
  interest_only: "Vorfinanzierung (zinsdienstlich)",
  bauspar: "Bausparvertrag",
};

const LOAN_TYPE_DESCRIPTIONS: Record<LoanType, string> = {
  annuity: "Klassische monatliche Rate mit Zins- und Tilgungsanteil",
  interest_only: "Nur Zinszahlung – wird durch einen Bausparvertrag abgelöst",
  bauspar: "Sparphase mit Zuteilung, anschließend Bauspardarlehen",
};

export function LoanForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rateMode, setRateMode] = useState<RateMode>("direct");
  const [lastInterestRaw, setLastInterestRaw] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    setError,
  } = useForm<LoanFormInput>({
    resolver: zodResolver(loanSchema),
    defaultValues: props.mode === "edit" ? props.defaultValues : {
      balanceDate: todayLocal(),
      loanType: "annuity",
    },
  });

  const balanceEur = watch("balanceEur");
  const monthlyPaymentEur = watch("monthlyPaymentEur");
  const loanType = watch("loanType") ?? "annuity";

  function calcRateFromPayment(interestStr: string, balance: number) {
    const interest = parseFloat(interestStr.replace(",", "."));
    if (!isNaN(interest) && interest > 0 && balance > 0) {
      const rate = (interest / balance) * 12 * 100;
      setValue("interestRatePercent", Math.round(rate * 10000) / 10000, { shouldValidate: true });
    }
  }

  function handleLastInterestChange(v: string) {
    setLastInterestRaw(v);
    calcRateFromPayment(v, balanceEur);
  }

  function handleRateModeChange(m: RateMode) {
    setRateMode(m);
    setLastInterestRaw("");
  }

  function calcRateFromMonthlyPayment() {
    if (monthlyPaymentEur && balanceEur && monthlyPaymentEur > 0 && balanceEur > 0) {
      const rate = (monthlyPaymentEur / balanceEur) * 12 * 100;
      setValue("interestRatePercent", Math.round(rate * 10000) / 10000, { shouldValidate: true });
    }
  }

  const onSubmit = (data: LoanFormInput) => {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createLoanAction(data)
          : await updateLoanAction(props.loanId, data);

      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      toast.success("Gespeichert");
      router.push("/loans");
    });
  };

  const isAnnuity = loanType === "annuity";
  const isInterestOnly = loanType === "interest_only";
  const isBauspar = loanType === "bauspar";

  // Bei Bausparvertrag in der Sparphase: Restschuld = 0, Stichtag = heute (User gibt nichts ein)
  useEffect(() => {
    if (isBauspar) {
      setValue("balanceEur", 0);
      setValue("balanceDate", todayLocal());
      setValue("initialAmountEur", undefined);
      setValue("interestFixedUntil", "");
    }
  }, [isBauspar, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {errors.root && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {errors.root.message}
        </div>
      )}

      {/* Typ-Auswahl */}
      <div className="flex flex-col gap-2">
        <Label>Darlehenstyp</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.keys(LOAN_TYPE_LABELS) as LoanType[]).map((t) => (
            <label
              key={t}
              className={cn(
                "cursor-pointer rounded-lg border-2 p-3 text-sm transition-colors",
                loanType === t ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/40"
              )}
            >
              <input
                type="radio"
                value={t}
                {...register("loanType")}
                disabled={isPending}
                className="sr-only"
              />
              <div className="font-medium">{LOAN_TYPE_LABELS[t]}</div>
              <div className="text-xs text-muted-foreground mt-1">{LOAN_TYPE_DESCRIPTIONS[t]}</div>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="propertyId">Objekt</Label>
          <select
            id="propertyId"
            {...register("propertyId")}
            disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">– bitte wählen –</option>
            {props.properties.map((p) => (
              <option key={p.id} value={p.id}>{p.street}, {p.city}</option>
            ))}
          </select>
          {errors.propertyId && <p className="text-xs text-destructive">{errors.propertyId.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Bezeichnung</Label>
          <Input
            id="description"
            {...register("description")}
            placeholder={isBauspar ? "z. B. LBS Bauspar 2024" : isInterestOnly ? "z. B. Vorfinanzierung Sparkasse" : "z. B. Hauptdarlehen, KfW"}
            disabled={isPending}
          />
          {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
        </div>

        {!isBauspar && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="initialAmountEur">
              Ursprünglicher Darlehensbetrag <span className="text-muted-foreground font-normal">– optional</span>
            </Label>
            <div className="relative">
              <Input
                id="initialAmountEur"
                type="number"
                step="0.01"
                min="0"
                placeholder="Unbekannt"
                {...register("initialAmountEur", { setValueAs: (v) => v === "" || v === null ? undefined : Number(v) })}
                disabled={isPending}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
            </div>
            {errors.initialAmountEur && <p className="text-xs text-destructive">{errors.initialAmountEur.message}</p>}
          </div>
        )}

        {!isBauspar && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="balanceEur">Aktuelle Restschuld</Label>
            <div className="relative">
              <Input
                id="balanceEur"
                type="number"
                step="0.01"
                min="0"
                placeholder="250000,00"
                {...register("balanceEur", { valueAsNumber: true })}
                disabled={isPending}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
            </div>
            {errors.balanceEur && <p className="text-xs text-destructive">{errors.balanceEur.message}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label>Zinssatz (p.a.){isBauspar && <span className="text-muted-foreground font-normal ml-1">– für Bauspardarlehensphase</span>}</Label>

          {/* Vorfinanzierung: vereinfachte Darstellung — monatliche Rate = Zinszahlung */}
          {isInterestOnly ? (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="relative max-w-[200px]">
                <Input
                  id="interestRatePercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="30"
                  placeholder="3,95"
                  {...register("interestRatePercent", { valueAsNumber: true })}
                  disabled={isPending}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
              </div>
              <button
                type="button"
                onClick={calcRateFromMonthlyPayment}
                disabled={isPending || !monthlyPaymentEur || !balanceEur}
                className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline pb-2"
                title="Berechnet sich aus Monatlicher Rate × 12 / Restschuld"
              >
                Aus Monatsrate berechnen
              </button>
            </div>
          ) : (
            <>
              <div className="inline-flex rounded-lg border bg-muted/50 p-1 gap-1 w-fit mb-1">
                {(["direct", "from_payment"] as RateMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleRateModeChange(m)}
                    disabled={isPending}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      rateMode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "direct" ? "Direkt eingeben" : "Aus Zinszahlung berechnen"}
                  </button>
                ))}
              </div>

              {rateMode === "direct" ? (
                <div className="relative max-w-[200px]">
                  <Input
                    id="interestRatePercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="30"
                    placeholder="0,80"
                    {...register("interestRatePercent", { valueAsNumber: true })}
                    disabled={isPending}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                </div>
              ) : (
                <div className="flex items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Letzte Zinszahlung</span>
                    <div className="relative max-w-[200px]">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="359,41"
                        value={lastInterestRaw}
                        onChange={(e) => handleLastInterestChange(e.target.value)}
                        disabled={isPending}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Berechneter Zinssatz</span>
                    <div className="relative max-w-[200px]">
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        max="30"
                        placeholder="–"
                        {...register("interestRatePercent", { valueAsNumber: true })}
                        disabled={isPending}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {errors.interestRatePercent && <p className="text-xs text-destructive">{errors.interestRatePercent.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="monthlyPaymentEur">
            {isInterestOnly ? "Monatliche Zinsrate" : isBauspar ? "Rate nach Zuteilung" : "Monatliche Rate"}
          </Label>
          <div className="relative">
            <Input
              id="monthlyPaymentEur"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="750,00"
              {...register("monthlyPaymentEur", { valueAsNumber: true })}
              disabled={isPending}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
          </div>
          {errors.monthlyPaymentEur && <p className="text-xs text-destructive">{errors.monthlyPaymentEur.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">
            {isBauspar ? "Vertragsbeginn" : "Darlehensbeginn"}{" "}
            <span className="text-muted-foreground font-normal">– optional</span>
          </Label>
          <Input id="startDate" type="date" {...register("startDate")} disabled={isPending} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
        </div>

        {!isBauspar && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="balanceDate">Restschuld per</Label>
            <Input id="balanceDate" type="date" {...register("balanceDate")} disabled={isPending} />
            {errors.balanceDate && <p className="text-xs text-destructive">{errors.balanceDate.message}</p>}
          </div>
        )}

        {!isBauspar && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="interestFixedUntil">
              Zinsbindung bis <span className="text-muted-foreground font-normal">– optional</span>
            </Label>
            <Input id="interestFixedUntil" type="date" {...register("interestFixedUntil")} disabled={isPending} />
            {errors.interestFixedUntil && <p className="text-xs text-destructive">{errors.interestFixedUntil.message}</p>}
          </div>
        )}
      </div>

      {/* Verknüpfung Vorfinanzierung → Bausparvertrag */}
      {isInterestOnly && (
        <div className="rounded-lg border-2 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Ablösung durch Bausparvertrag</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Diese Vorfinanzierung wird bei Zuteilungsreife durch den verknüpften Bausparvertrag abgelöst.
            </p>
          </div>
          <div className="flex flex-col gap-2 max-w-md">
            <Label htmlFor="replacedByLoanId">Verknüpfter Bausparvertrag</Label>
            <select
              id="replacedByLoanId"
              {...register("replacedByLoanId")}
              disabled={isPending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">– keine Verknüpfung –</option>
              {props.bausparLoans.map((l) => (
                <option key={l.id} value={l.id}>{l.description}</option>
              ))}
            </select>
            {props.bausparLoans.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Noch kein Bausparvertrag erfasst – erst einen Bausparvertrag anlegen, dann hier verknüpfen.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bauspar-spezifische Felder */}
      {isBauspar && <LoanBausparFields register={register} errors={errors} disabled={isPending} />}

      {!isAnnuity && (
        <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Hinweis:</strong>{" "}
          {isInterestOnly && "Bei Vorfinanzierungen wird im Tilgungsplan nur der Zinsanteil generiert – die Restschuld bleibt konstant bis zur Ablösung."}
          {isBauspar && "Vor Zuteilung läuft die Sparphase (Restschuld 0). Nach Zuteilung wird der Bauspardarlehensteil mit obigen Konditionen getilgt."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">
          Notizen <span className="text-muted-foreground font-normal">– optional</span>
        </Label>
        <Textarea id="notes" {...register("notes")} placeholder="Kreditinstitut, Sondertilgungen…" rows={3} disabled={isPending} />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>
          Speichern
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/loans")}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
