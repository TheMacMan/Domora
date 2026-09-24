"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Ältere Jahre (absteigend), die nicht als Button angezeigt werden */
  years: number[];
  /** Aktuell gewähltes Jahr */
  selected: number;
  propertyId: string | undefined;
};

// Auswahlliste für ältere Steuerjahre — hält die Button-Leiste kompakt
// und öffnet auf iPhone/iPad den nativen Auswahl-Picker.
export function TaxYearSelect({ years, selected, propertyId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isOlderSelected = years.includes(selected);

  return (
    <select
      aria-label="Älteres Jahr wählen"
      value={isOlderSelected ? String(selected) : ""}
      disabled={isPending}
      onChange={(e) => {
        const y = e.target.value;
        if (!y) return;
        const qs = new URLSearchParams({ year: y });
        if (propertyId) qs.set("propertyId", propertyId);
        startTransition(() => router.push(`/tax?${qs.toString()}`));
      }}
      className={
        "h-8 rounded-md border px-2 text-base md:text-sm transition-colors " +
        (isOlderSelected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-foreground border-input hover:bg-muted/40")
      }
    >
      <option value="" disabled>
        Ältere Jahre …
      </option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
