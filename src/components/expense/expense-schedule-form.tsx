"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  expenseScheduleSchema,
  type ExpenseScheduleFormInput,
} from "@/lib/validators/expense-schedule";
import {
  createExpenseScheduleAction,
  updateExpenseScheduleAction,
} from "@/server/actions/expense-schedules";
import { CATEGORY_LABELS, CATEGORY_GROUPS } from "@/lib/expense";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";

type Property = { id: string; street: string; city: string };

type Props =
  | { mode: "create"; properties: Property[] }
  | {
      mode: "edit";
      scheduleId: string;
      defaultValues: ExpenseScheduleFormInput;
      properties: Property[];
    };

export function ExpenseScheduleForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setError,
  } = useForm<ExpenseScheduleFormInput>({
    resolver: zodResolver(expenseScheduleSchema),
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : { dayOfMonth: 1, startMonth: thisMonth, propertyId: null },
  });

  const amountEur = watch("amountEur");
  const startMonth = watch("startMonth");
  const endMonth = watch("endMonth");

  const monthsCount = (() => {
    if (!startMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) return null;
    const end = endMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth) ? endMonth : null;
    if (!end) return null;
    if (end < startMonth) return null;
    const [sy, sm] = startMonth.split("-").map(Number) as [number, number];
    const [ey, em] = end.split("-").map(Number) as [number, number];
    return (ey - sy) * 12 + (em - sm) + 1;
  })();

  const onSubmit = (data: ExpenseScheduleFormInput) => {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createExpenseScheduleAction(data)
          : await updateExpenseScheduleAction(props.scheduleId, data);
      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      toast.success("Gespeichert");
      router.push("/expenses/recurring");
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {errors.root && (
        <div className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {errors.root.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amountEur">Monatlicher Betrag</Label>
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
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              €
            </span>
          </div>
          {errors.amountEur && (
            <p className="text-xs text-destructive">{errors.amountEur.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dayOfMonth">Tag im Monat</Label>
          <Input
            id="dayOfMonth"
            type="number"
            min="1"
            max="28"
            step="1"
            {...register("dayOfMonth", { valueAsNumber: true })}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">1–28 (Buchungs-/Zahldatum)</p>
          {errors.dayOfMonth && (
            <p className="text-xs text-destructive">{errors.dayOfMonth.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Kategorie (Anlage V)</Label>
          <select
            id="category"
            {...register("category")}
            disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            {CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {errors.category && (
            <p className="text-xs text-destructive">{errors.category.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="propertyId">Objekt</Label>
          <select
            id="propertyId"
            {...register("propertyId")}
            disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="">Alle Objekte (anteilig)</option>
            {props.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.street}, {p.city}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="startMonth">Startmonat</Label>
          <Input
            id="startMonth"
            type="month"
            {...register("startMonth")}
            disabled={isPending}
          />
          {errors.startMonth && (
            <p className="text-xs text-destructive">{errors.startMonth.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="endMonth">
            Endmonat <span className="text-muted-foreground font-normal">– optional</span>
          </Label>
          <Input
            id="endMonth"
            type="month"
            {...register("endMonth")}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Leer = laufend (Generierung 12 Monate in die Zukunft)
          </p>
          {errors.endMonth && (
            <p className="text-xs text-destructive">{errors.endMonth.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">
          Beschreibung <span className="text-muted-foreground font-normal">– empfohlen</span>
        </Label>
        <Input
          id="description"
          {...register("description")}
          placeholder="z. B. Hausgeld WEG In den Gärten 16"
          disabled={isPending}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      {monthsCount != null && amountEur > 0 && (
        <div className="rounded-md bg-muted/30 border px-4 py-3 text-sm">
          <span className="text-muted-foreground">Vorschau: </span>
          <span className="font-medium">{monthsCount}</span> Buchungen ×{" "}
          <span className="font-medium tabular-nums">
            {formatMoney(Math.round(amountEur * 100))}
          </span>{" "}
          ={" "}
          <span className="font-semibold tabular-nums">
            {formatMoney(Math.round(amountEur * 100) * monthsCount)}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">
          Notizen <span className="text-muted-foreground font-normal">– optional</span>
        </Label>
        <Textarea
          id="notes"
          {...register("notes")}
          placeholder="Bankverbindung, WEG-Verwalter, Anmerkungen…"
          rows={3}
          disabled={isPending}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>
          Speichern
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.push("/expenses/recurring")}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
