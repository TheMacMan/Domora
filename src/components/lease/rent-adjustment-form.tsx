"use client";

import { useTransition, useState, useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { rentAdjustmentSchema, type RentAdjustmentFormInput } from "@/lib/validators/rent-adjustment";
import { createRentAdjustmentAction } from "@/server/actions/rent-adjustments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "new" | "percent" | "delta";

type Props = {
  leaseId: string;
  currentRentEur: number;
  currentServiceChargesEur?: number;
};

function fmt(eur: number) {
  return eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function calc(mode: Mode, raw: string, current: number): number | null {
  const v = parseFloat(raw.replace(",", "."));
  if (isNaN(v) || raw.trim() === "") return null;
  if (mode === "new")     return Math.round(v * 100) / 100;
  if (mode === "percent") return Math.round(current * (1 + v / 100) * 100) / 100;
  return Math.round((current + v) * 100) / 100;
}

const MODES: { key: Mode; label: string; unit: string }[] = [
  { key: "new",     label: "Neuer Betrag", unit: "€" },
  { key: "percent", label: "+ Prozent",    unit: "%" },
  { key: "delta",   label: "+ Betrag",     unit: "€" },
];

function DiffBadge({ next, current }: { next: number; current: number }) {
  const diff = next - current;
  const pct  = current > 0 ? (diff / current) * 100 : 0;
  const pos  = diff >= 0;
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded-full font-medium tabular-nums",
      pos ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
    )}>
      {pos ? "+" : ""}{fmt(diff)} / {pos ? "+" : ""}{pct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %
    </span>
  );
}

function ModeInput({
  label,
  current,
  mode,
  raw,
  onModeChange,
  onRawChange,
  disabled,
  placeholder,
}: {
  label: string;
  current: number | undefined;
  mode: Mode;
  raw: string;
  onModeChange: (m: Mode) => void;
  onRawChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const activeMode = MODES.find((m) => m.key === mode)!;
  const newVal = current != null ? calc(mode, raw, current) : null;
  const changed = newVal != null && current != null && newVal !== current;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <div className="inline-flex rounded-lg border bg-muted/50 p-1 gap-1">
        {MODES.map(({ key, label: ml }) => (
          <button
            key={key}
            type="button"
            onClick={() => onModeChange(key)}
            disabled={disabled}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {ml}
          </button>
        ))}
      </div>

      <div className="relative max-w-[200px]">
        <Input
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={(e) => onRawChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-7"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
          {activeMode.unit}
        </span>
      </div>

      {/* Inline-Vorschau wenn Mode nicht "new" */}
      {mode !== "new" && newVal != null && current != null && (
        <p className="text-sm text-muted-foreground">
          {fmt(current)}
          <span className="mx-2">→</span>
          <span className="font-medium text-foreground">{fmt(newVal)}</span>
          {changed && <span className="ml-2"><DiffBadge next={newVal} current={current} /></span>}
        </p>
      )}
    </div>
  );
}

export function RentAdjustmentForm({ leaseId, currentRentEur, currentServiceChargesEur }: Props) {
  const router  = useRouter();
  const formId  = useId();
  const [isPending, startTransition] = useTransition();

  const [rentMode, setRentMode] = useState<Mode>("new");
  const [rentRaw,  setRentRaw]  = useState(currentRentEur.toFixed(2).replace(".", ","));

  const hasSC = currentServiceChargesEur != null;
  const [scMode, setScMode] = useState<Mode>("new");
  const [scRaw,  setScRaw]  = useState(hasSC ? (currentServiceChargesEur ?? 0).toFixed(2).replace(".", ",") : "");
  const [scEnabled, setScEnabled] = useState(hasSC);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    setError,
  } = useForm<RentAdjustmentFormInput>({
    resolver: zodResolver(rentAdjustmentSchema),
    defaultValues: {
      rentEur: currentRentEur,
      serviceChargesEur: currentServiceChargesEur,
    },
  });

  function handleRentModeChange(m: Mode) {
    setRentMode(m);
    setRentRaw(m === "new" ? currentRentEur.toFixed(2).replace(".", ",") : "");
    setValue("rentEur", currentRentEur);
  }
  function handleRentRawChange(v: string) {
    setRentRaw(v);
    const newVal = calc(rentMode, v, currentRentEur);
    if (newVal != null && newVal > 0) setValue("rentEur", newVal, { shouldValidate: true });
  }

  function handleScModeChange(m: Mode) {
    setScMode(m);
    const base = currentServiceChargesEur ?? 0;
    setScRaw(m === "new" ? base.toFixed(2).replace(".", ",") : "");
    setValue("serviceChargesEur", base);
  }
  function handleScRawChange(v: string) {
    setScRaw(v);
    const base = currentServiceChargesEur ?? 0;
    const newVal = calc(scMode, v, base);
    setValue("serviceChargesEur", newVal ?? undefined);
  }

  const newRentEur = calc(rentMode, rentRaw, currentRentEur);
  const newScEur   = scEnabled ? calc(scMode, scRaw, currentServiceChargesEur ?? 0) : (currentServiceChargesEur ?? null);
  const newWarm    = (newRentEur ?? 0) + (newScEur ?? 0);
  const curWarm    = currentRentEur + (currentServiceChargesEur ?? 0);

  const onSubmit = (data: RentAdjustmentFormInput) => {
    startTransition(async () => {
      const result = await createRentAdjustmentAction(leaseId, data);
      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      toast.success("Mietanpassung gespeichert");
      router.push(`/leases/${leaseId}`);
    });
  };

  const canSubmit = newRentEur != null && newRentEur > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-7">
      {errors.root && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {errors.root.message}
        </div>
      )}

      {/* Datum */}
      <div className="flex flex-col gap-2 max-w-[200px]">
        <Label htmlFor={`${formId}-date`}>Gültig ab</Label>
        <Input id={`${formId}-date`} type="date" {...register("effectiveDate")} disabled={isPending} />
        {errors.effectiveDate && <p className="text-xs text-destructive">{errors.effectiveDate.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Kaltmiete */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kaltmiete</span>
            <span className="text-xs text-muted-foreground">bisher {fmt(currentRentEur)}</span>
          </div>
          <ModeInput
            label=""
            current={currentRentEur}
            mode={rentMode}
            raw={rentRaw}
            onModeChange={handleRentModeChange}
            onRawChange={handleRentRawChange}
            disabled={isPending}
            placeholder={rentMode === "new" ? currentRentEur.toFixed(2).replace(".", ",") : rentMode === "percent" ? "3,20" : "40,00"}
          />
          {errors.rentEur && <p className="text-xs text-destructive">{errors.rentEur.message}</p>}
          <input type="hidden" {...register("rentEur", { valueAsNumber: true })} />
        </div>

        {/* Nebenkosten */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nebenkosten-Vorauszahlung</span>
              <span className="text-xs text-muted-foreground">bisher {hasSC ? fmt(currentServiceChargesEur!) : "–"}</span>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scEnabled}
                onChange={(e) => {
                  setScEnabled(e.target.checked);
                  if (!e.target.checked) setValue("serviceChargesEur", undefined);
                }}
                className="rounded"
              />
              anpassen
            </label>
          </div>

          {scEnabled ? (
            <>
              <ModeInput
                label=""
                current={currentServiceChargesEur ?? 0}
                mode={scMode}
                raw={scRaw}
                onModeChange={handleScModeChange}
                onRawChange={handleScRawChange}
                disabled={isPending}
                placeholder={scMode === "new" ? (currentServiceChargesEur ?? 0).toFixed(2).replace(".", ",") : scMode === "percent" ? "5,00" : "10,00"}
              />
              <input type="hidden" {...register("serviceChargesEur", { valueAsNumber: true })} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground pt-2">
              Nebenkosten bleiben unverändert{hasSC ? ` (${fmt(currentServiceChargesEur!)})` : ""}.
            </p>
          )}
        </div>
      </div>

      {/* Vorschau Warmmiete */}
      {newRentEur != null && (
        <div className="rounded-xl border bg-muted/40 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Vorschau nach Anpassung</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Kaltmiete</p>
              <p className="font-semibold tabular-nums">{fmt(newRentEur)}</p>
              {newRentEur !== currentRentEur && (
                <p className="mt-1"><DiffBadge next={newRentEur} current={currentRentEur} /></p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Nebenkosten</p>
              <p className="font-semibold tabular-nums">{newScEur != null ? fmt(newScEur) : "–"}</p>
              {scEnabled && newScEur != null && newScEur !== (currentServiceChargesEur ?? 0) && (
                <p className="mt-1"><DiffBadge next={newScEur} current={currentServiceChargesEur ?? 0} /></p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Warmmiete</p>
              <p className="font-bold tabular-nums text-foreground">{fmt(newWarm)}</p>
              {newWarm !== curWarm && (
                <p className="mt-1"><DiffBadge next={newWarm} current={curWarm} /></p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grund */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-reason`}>
          Grund <span className="text-muted-foreground font-normal">– optional</span>
        </Label>
        <Input
          id={`${formId}-reason`}
          {...register("reason")}
          placeholder="z. B. Indexanpassung VPI +3,2 %, Staffelmiete Stufe 2"
          disabled={isPending}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending || !canSubmit}>
          {isPending ? "Speichern…" : "Anpassung speichern"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(`/leases/${leaseId}`)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
