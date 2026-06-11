"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { propertySchema, type PropertyFormInput } from "@/lib/validators/property";
import { createPropertyAction, updatePropertyAction } from "@/server/actions/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props =
  | { mode: "create"; defaultDepreciationRate?: number }
  | { mode: "edit"; propertyId: string; defaultValues: PropertyFormInput };

export function PropertyForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<PropertyFormInput>({
    resolver: zodResolver(propertySchema),
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : { depreciationRate: (props.defaultDepreciationRate ?? 2) as number },
  });

  const onSubmit = (data: PropertyFormInput) => {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createPropertyAction(data)
          : await updatePropertyAction(props.propertyId, data);

      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      toast.success("Gespeichert");
      router.push("/properties");
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {errors.root && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {errors.root.message}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-muted-foreground mb-3">Adresse</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3 flex flex-col gap-2">
            <Label htmlFor="street">Straße & Hausnummer</Label>
            <Input id="street" {...register("street")} placeholder="Musterstraße 1" disabled={isPending} />
            {errors.street && <p className="text-xs text-destructive">{errors.street.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="postalCode">PLZ</Label>
            <Input id="postalCode" {...register("postalCode")} placeholder="63679" maxLength={5} disabled={isPending} />
            {errors.postalCode && <p className="text-xs text-destructive">{errors.postalCode.message}</p>}
          </div>
          <div className="sm:col-span-2 flex flex-col gap-2">
            <Label htmlFor="city">Ort</Label>
            <Input id="city" {...register("city")} placeholder="Hörstein" disabled={isPending} />
            {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-muted-foreground mb-3">Eigenschaften</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="yearBuilt">Baujahr</Label>
            <Input id="yearBuilt" type="number" min="1800" max="2030" {...register("yearBuilt", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : parseInt(v) })} placeholder="1985" disabled={isPending} />
            {errors.yearBuilt && <p className="text-xs text-destructive">{errors.yearBuilt.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="depreciationRate">AfA-Satz (%)</Label>
            <Input id="depreciationRate" type="number" step="0.1" min="0.1" max="10" {...register("depreciationRate", { valueAsNumber: true, required: true })} placeholder="2.0" disabled={isPending} />
            {errors.depreciationRate && <p className="text-xs text-destructive">{errors.depreciationRate.message}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-muted-foreground mb-3">Anschaffung</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchaseDate">Anschaffungsdatum</Label>
            <Input id="purchaseDate" type="date" {...register("purchaseDate", { setValueAs: (v) => v === "" ? undefined : v })} disabled={isPending} />
            {errors.purchaseDate && <p className="text-xs text-destructive">{errors.purchaseDate.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchasePriceTotalEur">Kaufpreis gesamt (€)</Label>
            <Input id="purchasePriceTotalEur" type="number" step="0.01" min="0" {...register("purchasePriceTotalEur", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : Number(v) })} placeholder="250000.00" disabled={isPending} />
            {errors.purchasePriceTotalEur && <p className="text-xs text-destructive">{errors.purchasePriceTotalEur.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchasePriceLandEur">davon Grund-/Boden-Anteil (€)</Label>
            <Input id="purchasePriceLandEur" type="number" step="0.01" min="0" {...register("purchasePriceLandEur", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : Number(v) })} placeholder="50000.00" disabled={isPending} />
            {errors.purchasePriceLandEur && <p className="text-xs text-destructive">{errors.purchasePriceLandEur.message}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-muted-foreground mb-3">Mietpotential (optional)</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="referenceRentEurPerSqm">Vergleichsmiete (€/m²)</Label>
            <Input id="referenceRentEurPerSqm" type="number" step="0.01" min="0" max="100" {...register("referenceRentEurPerSqm", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : Number(v) })} placeholder="13.20" disabled={isPending} />
            <p className="text-xs text-muted-foreground">Orientierungswert aus Mietspiegel oder Immo-Portal. Wird auf der Mietentwicklung-Seite zur Ermittlung des Erhöhungspotentials genutzt.</p>
            {errors.referenceRentEurPerSqm && <p className="text-xs text-destructive">{errors.referenceRentEurPerSqm.message}</p>}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notizen</Label>
        <Textarea id="notes" {...register("notes")} placeholder="Freitext…" rows={3} disabled={isPending} />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>
          Speichern
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/properties")}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
