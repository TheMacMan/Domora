"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FilePlus2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveTripLogReceiptAction, updateVehicleYearAction } from "@/server/actions/vehicles";

// Methode (individuell/Pauschale), vorläufige Gesamt-km und Fahrtenliste als Beleg
export function VehicleYearControls({
  vehicleId,
  year,
  method,
  estimatedKm,
  hasTrips,
}: {
  vehicleId: string;
  year: number;
  method: "actual" | "flat";
  estimatedKm: number | null;
  hasTrips: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [km, setKm] = useState(estimatedKm != null ? String(estimatedKm) : "");

  function save(next: { method: "actual" | "flat"; estimatedKm: number | null }) {
    startTransition(async () => {
      const res = await updateVehicleYearAction(vehicleId, year, next);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Gespeichert – Fahrten neu berechnet");
      router.refresh();
    });
  }

  function saveLog() {
    startTransition(async () => {
      const res = await saveTripLogReceiptAction(vehicleId, year);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Fahrtenliste als Beleg abgelegt");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <div className="inline-flex rounded-md border p-0.5">
        {(["actual", "flat"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={isPending || m === method}
            onClick={() => save({ method: m, estimatedKm: km ? Number(km) : null })}
            className={`rounded px-2 py-1 ${m === method ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
          >
            {m === "actual" ? "Individueller Satz" : "Pauschale 0,30 €"}
          </button>
        ))}
      </div>
      {method === "actual" && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save({ method, estimatedKm: km ? Number(km) : null });
          }}
        >
          <label htmlFor={`est-${vehicleId}-${year}`} className="text-muted-foreground">Schätzung km:</label>
          <Input id={`est-${vehicleId}-${year}`} inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} className="h-7 w-24 text-xs" />
          <Button type="submit" size="sm" variant="outline" className="h-7" disabled={isPending}>OK</Button>
        </form>
      )}
      {hasTrips && (
        <>
          <Button asChild size="sm" variant="outline" className="h-7">
            <a href={`/api/trips/pdf?vehicleId=${vehicleId}&year=${year}`}>
              <FileDown className="size-3.5" />
              Fahrtenliste
            </a>
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7" disabled={isPending} onClick={saveLog} title="PDF erzeugen, unter Dokumente ablegen und als Beleg für alle Fahrten des Jahres verknüpfen">
            <FilePlus2 className="size-3.5" />
            Als Beleg ablegen
          </Button>
        </>
      )}
    </div>
  );
}
