"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { unitSchema, type UnitFormInput } from "@/lib/validators/unit";
import { createUnitAction, updateUnitAction } from "@/server/actions/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props =
  | { mode: "create"; propertyId: string }
  | { mode: "edit"; propertyId: string; unitId: string; defaultValues: UnitFormInput };

export function UnitForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<UnitFormInput>({
    resolver: zodResolver(unitSchema),
    defaultValues: props.mode === "edit" ? props.defaultValues : undefined,
  });

  const onSubmit = (data: UnitFormInput) => {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createUnitAction(props.propertyId, data)
          : await updateUnitAction(props.unitId, data);

      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      toast.success("Gespeichert");
      router.push(`/properties/${props.propertyId}`);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {errors.root && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {errors.root.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2 flex flex-col gap-2">
          <Label htmlFor="name">Bezeichnung</Label>
          <Input id="name" {...register("name")} placeholder="z. B. EG links, Wohnung 2" disabled={isPending} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="floor">Etage</Label>
          <Input
            id="floor"
            type="number"
            min="-5"
            max="50"
            {...register("floor", { setValueAs: (v) => v === "" || isNaN(Number(v)) ? undefined : parseInt(v) })}
            placeholder="0 = EG"
            disabled={isPending}
          />
          {errors.floor && <p className="text-xs text-destructive">{errors.floor.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="livingArea">Wohnfläche (m²)</Label>
          <Input
            id="livingArea"
            type="number"
            step="0.01"
            min="0.01"
            {...register("livingArea", { valueAsNumber: true, required: true })}
            placeholder="73.5"
            disabled={isPending}
          />
          {errors.livingArea && <p className="text-xs text-destructive">{errors.livingArea.message}</p>}
        </div>
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
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(`/properties/${props.propertyId}`)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
