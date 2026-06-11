"use client";

import { useTransition } from "react";
import { useForm, Controller, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { leaseSchema, type LeaseFormInput, RENT_COMPONENT_KINDS, RENT_COMPONENT_LABELS, type RentComponentKind } from "@/lib/validators/lease";
import { createLeaseAction, updateLeaseAction } from "@/server/actions/leases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { TenantMultiSelect, type TenantOption } from "./tenant-multi-select";

type UnitOption = { id: string; label: string };

type Props =
  | { mode: "create"; units: UnitOption[]; tenants: TenantOption[] }
  | { mode: "edit"; leaseId: string; units: UnitOption[]; tenants: TenantOption[]; defaultValues: LeaseFormInput };

const selectClass =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const rentTypeLabels: Record<string, string> = {
  fixed: "Festmiete",
  index: "Indexmiete",
  graduated: "Staffelmiete",
};

export function LeaseForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LeaseFormInput>({
    resolver: zodResolver(leaseSchema),
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : { rentType: "fixed", tenantIds: [], depositMode: "fixed" },
  });

  const depositMode = useWatch({ control, name: "depositMode" });
  const rentEur = useWatch({ control, name: "rentEur" });
  const depositFactor = useWatch({ control, name: "depositFactor" });

  const componentsArray = useFieldArray({ control, name: "rentComponents" });
  const componentsWatch = useWatch({ control, name: "rentComponents" }) ?? [];
  const componentsTotal = componentsWatch.reduce((s, c) => s + (typeof c?.amountEur === "number" && !isNaN(c.amountEur) ? c.amountEur : 0), 0);
  const totalColdEur = (typeof rentEur === "number" ? rentEur : 0) + componentsTotal;

  const onSubmit = (data: LeaseFormInput) => {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createLeaseAction(data)
          : await updateLeaseAction(props.leaseId, data);

      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      toast.success("Gespeichert");
      router.push("/leases");
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
          <Label htmlFor="unitId">Wohneinheit</Label>
          <select id="unitId" {...register("unitId")} disabled={isPending} className={selectClass}>
            <option value="">– Bitte wählen –</option>
            {props.units.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
          {errors.unitId && <p className="text-xs text-destructive">{errors.unitId.message}</p>}
        </div>

        {/* Multi-tenant selector */}
        <div className="flex flex-col gap-2">
          <Label>
            Mieter
            <span className="ml-1 text-xs font-normal text-muted-foreground">(mehrere möglich)</span>
          </Label>
          <Controller
            name="tenantIds"
            control={control}
            render={({ field }) => (
              <TenantMultiSelect
                tenants={props.tenants}
                value={field.value ?? []}
                onChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
          {errors.tenantIds && (
            <p className="text-xs text-destructive">{errors.tenantIds.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">Mietbeginn</Label>
          <Input id="startDate" type="date" {...register("startDate")} disabled={isPending} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">Mietende <span className="text-muted-foreground">(leer = unbefristet)</span></Label>
          <Input
            id="endDate"
            type="date"
            {...register("endDate", { setValueAs: (v) => v === "" ? undefined : v })}
            disabled={isPending}
          />
          {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rentType">Mietart</Label>
          <select id="rentType" {...register("rentType")} disabled={isPending} className={selectClass}>
            {Object.entries(rentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {errors.rentType && <p className="text-xs text-destructive">{errors.rentType.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rentEur">Kaltmiete (€)</Label>
          <Input
            id="rentEur"
            type="number"
            step="0.01"
            min="0.01"
            {...register("rentEur", { valueAsNumber: true })}
            placeholder="650.00"
            disabled={isPending}
          />
          {errors.rentEur && <p className="text-xs text-destructive">{errors.rentEur.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="serviceChargesEur">NK-Vorauszahlung (€)</Label>
          <Input
            id="serviceChargesEur"
            type="number"
            step="0.01"
            min="0"
            {...register("serviceChargesEur", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : Number(v) })}
            placeholder="150.00"
            disabled={isPending}
          />
          {errors.serviceChargesEur && <p className="text-xs text-destructive">{errors.serviceChargesEur.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Kaution</Label>
            <Controller
              name="depositMode"
              control={control}
              render={({ field }) => (
                <div className="inline-flex rounded-md border text-xs overflow-hidden">
                  {(["fixed", "factor"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={isPending}
                      onClick={() => field.onChange(mode)}
                      className={cn(
                        "px-2.5 py-1 transition-colors",
                        field.value === mode
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted/60"
                      )}
                    >
                      {mode === "fixed" ? "€ fix" : "× NKM"}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
          {depositMode === "fixed" ? (
            <>
              <Input
                id="depositEur"
                type="number"
                step="0.01"
                min="0"
                {...register("depositEur", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : Number(v) })}
                placeholder="1950.00"
                disabled={isPending}
              />
              {errors.depositEur && <p className="text-xs text-destructive">{errors.depositEur.message}</p>}
            </>
          ) : (
            <>
              <div className="relative">
                <Input
                  id="depositFactor"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="6"
                  {...register("depositFactor", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : Number(v) })}
                  placeholder="3"
                  disabled={isPending}
                  className="pr-16"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  NKM
                </span>
              </div>
              {depositFactor != null && rentEur != null && rentEur > 0 && (
                <p className="text-xs text-muted-foreground">
                  = {(depositFactor * rentEur).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
              )}
              {errors.depositFactor && <p className="text-xs text-destructive">{errors.depositFactor.message}</p>}
            </>
          )}
        </div>
      </div>

      {/* Zusätzliche Mietkomponenten */}
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label className="text-sm font-medium">Zusätzliche Mietkomponenten</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Garage, Stellplatz, Küche etc. — werden zur Kaltmiete addiert
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => componentsArray.append({ kind: "garage", description: "", amountEur: 0 } as never)}
            disabled={isPending}
          >
            <Plus className="size-4" />
            Hinzufügen
          </Button>
        </div>

        {componentsArray.fields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Keine zusätzlichen Komponenten</p>
        ) : (
          <div className="space-y-2">
            {componentsArray.fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 sm:col-span-3">
                  <select
                    {...register(`rentComponents.${idx}.kind` as const)}
                    disabled={isPending}
                    className={selectClass}
                    aria-label="Art"
                  >
                    {RENT_COMPONENT_KINDS.map((k) => (
                      <option key={k} value={k}>{RENT_COMPONENT_LABELS[k as RentComponentKind]}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-7 sm:col-span-5">
                  <Input
                    placeholder="Bezeichnung (optional, z.B. Stellplatz Nr. 3)"
                    {...register(`rentComponents.${idx}.description` as const)}
                    disabled={isPending}
                  />
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="50,00"
                      {...register(`rentComponents.${idx}.amountEur` as const, { valueAsNumber: true })}
                      disabled={isPending}
                      className="pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
                  </div>
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => componentsArray.remove(idx)}
                    disabled={isPending}
                    title="Entfernen"
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
            {componentsTotal > 0 && (
              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                Komponenten zusammen: <span className="font-medium tabular-nums text-foreground">{componentsTotal.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>{" "}
                · Kaltmiete gesamt: <span className="font-medium tabular-nums text-foreground">{totalColdEur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notizen</Label>
        <Textarea id="notes" {...register("notes")} placeholder="Freitext…" rows={3} disabled={isPending} />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>
          Speichern
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/leases")}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
