"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { LoanFormInput } from "@/lib/validators/loan";

type Props = {
  register: UseFormRegister<LoanFormInput>;
  errors: FieldErrors<LoanFormInput>;
  disabled: boolean;
};

const numAs = (v: unknown) => (v === "" || v === null ? undefined : Number(v));

export function LoanBausparFields({ register, errors, disabled }: Props) {
  return (
    <div className="rounded-lg border-2 border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Sparphase</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Angaben zum aktuellen Stand des Bausparvertrags.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bsTotalSumEur">Bausparsumme</Label>
          <div className="relative">
            <Input
              id="bsTotalSumEur"
              type="number"
              step="0.01"
              min="0"
              placeholder="100000,00"
              {...register("bsTotalSumEur", { setValueAs: numAs })}
              disabled={disabled}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
          </div>
          {errors.bsTotalSumEur && <p className="text-xs text-destructive">{errors.bsTotalSumEur.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bsSavingsBalanceEur">Aktuelles Sparguthaben</Label>
          <div className="relative">
            <Input
              id="bsSavingsBalanceEur"
              type="number"
              step="0.01"
              min="0"
              placeholder="25000,00"
              {...register("bsSavingsBalanceEur", { setValueAs: numAs })}
              disabled={disabled}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bsSavingsDate">Stichtag Sparguthaben</Label>
          <Input id="bsSavingsDate" type="date" {...register("bsSavingsDate")} disabled={disabled} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bsMonthlySavingsEur">Monatliche Sparrate <span className="text-muted-foreground font-normal">(TEL)</span></Label>
          <div className="relative">
            <Input
              id="bsMonthlySavingsEur"
              type="number"
              step="0.01"
              min="0"
              placeholder="500,00"
              {...register("bsMonthlySavingsEur", { setValueAs: numAs })}
              disabled={disabled}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
          </div>
          {errors.bsMonthlySavingsEur && <p className="text-xs text-destructive">{errors.bsMonthlySavingsEur.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bsSavingsInterestPercent">
            Guthabenzins <span className="text-muted-foreground font-normal">– optional</span>
          </Label>
          <div className="relative max-w-[160px]">
            <Input
              id="bsSavingsInterestPercent"
              type="number"
              step="0.01"
              min="0"
              max="30"
              placeholder="0,10"
              {...register("bsSavingsInterestPercent", { setValueAs: numAs })}
              disabled={disabled}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bsMinSavingsPercent">
            Mindestsparquote <span className="text-muted-foreground font-normal">– z.B. 40 %</span>
          </Label>
          <div className="relative max-w-[160px]">
            <Input
              id="bsMinSavingsPercent"
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="40"
              {...register("bsMinSavingsPercent", { setValueAs: numAs })}
              disabled={disabled}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold mb-2">Bewertungszahl</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Die Zuteilungsreife wird erreicht, sobald Mindestsparquote <em>und</em> Ziel-Bewertungszahl erfüllt sind.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bsTargetRatingNumber">Ziel-Bewertungszahl</Label>
            <Input
              id="bsTargetRatingNumber"
              type="number"
              step="0.1"
              min="0"
              placeholder="100"
              {...register("bsTargetRatingNumber", { setValueAs: numAs })}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bsCurrentRatingNumber">Aktuelle Bewertungszahl</Label>
            <Input
              id="bsCurrentRatingNumber"
              type="number"
              step="0.1"
              min="0"
              placeholder="45"
              {...register("bsCurrentRatingNumber", { setValueAs: numAs })}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bsRatingDate">Stichtag Bewertungszahl</Label>
            <Input id="bsRatingDate" type="date" {...register("bsRatingDate")} disabled={disabled} />
          </div>
        </div>
      </div>
    </div>
  );
}
