"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { createNkAbrechnungAction } from "@/server/actions/service-charges";

type Property = { id: string; street: string; city: string };

export function NkAbrechnungNewForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [propertyId, setPropertyId] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!propertyId) {
      toast.error("Objekt wählen");
      return;
    }
    startTransition(async () => {
      const res = await createNkAbrechnungAction(propertyId, year);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Abrechnung erstellt");
      const id = res.data?.id;
      if (id) router.push(`/service-charges/${id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="propertyId">Objekt</Label>
        <select
          id="propertyId"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          disabled={isPending}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="">– bitte wählen –</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.street}, {p.city}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 max-w-[200px]">
        <Label htmlFor="year">Abrechnungsjahr</Label>
        <Input
          id="year"
          type="number"
          min="2000"
          max="2099"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          disabled={isPending}
        />
      </div>

      <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
        Beim Speichern werden automatisch alle umlegbaren Betriebskosten des Objekts dieses Jahres
        anhand der Default-Verteilerschlüssel auf die aktiven Mietverhältnisse verteilt. Du kannst
        die Verteilung anschließend pro Position überschreiben.
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>Erstellen</Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/service-charges")}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
