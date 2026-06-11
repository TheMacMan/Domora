"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { tenantSchema, type TenantFormInput } from "@/lib/validators/tenant";
import { createTenantAction, updateTenantAction } from "@/server/actions/tenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props =
  | { mode: "create" }
  | { mode: "edit"; tenantId: string; defaultValues: TenantFormInput };

export function TenantForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<TenantFormInput>({
    resolver: zodResolver(tenantSchema),
    defaultValues: props.mode === "edit" ? props.defaultValues : undefined,
  });

  const onSubmit = (data: TenantFormInput) => {
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createTenantAction(data)
          : await updateTenantAction(props.tenantId, data);

      if (!result.ok) {
        toast.error(result.error);
        setError("root", { message: result.error });
        return;
      }
      if (props.mode === "create" && result.id) {
        router.push(`/tenants/${result.id}`);
      } else {
        router.push("/tenants");
      }
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
          <Label htmlFor="firstName">Vorname</Label>
          <Input id="firstName" {...register("firstName")} placeholder="Max" disabled={isPending} />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Nachname</Label>
          <Input id="lastName" {...register("lastName")} placeholder="Mustermann" disabled={isPending} />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" type="email" {...register("email")} placeholder="max@beispiel.de" disabled={isPending} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" type="tel" {...register("phone")} placeholder="+49 160 1234567" disabled={isPending} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
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
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/tenants")}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
