"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { buildBalanceData, buildYearlyData, type LoanForProjection } from "@/lib/loan-projection";
import { LoanProgressSection } from "./loan-progress-section";
import { BalanceChart, YearlyInterestChart, InterestVsPrincipalChart } from "./loan-charts";

type Props = { loans: LoanForProjection[] };

// Domora-Farbpalette für Mehrfach-Segmente (Darlehen-Vergleich etc.).
// Familie um den Brand-Teal: warm/kühl ausbalanciert, alle moderat gesättigt,
// ähnliche Lightness — visuell unterscheidbar, aber als Gruppe harmonisch.
const COLORS = [
  "#1E6E76", // Teal (Brand)
  "#C5614B", // Terrakotta
  "#C99749", // Ocker
  "#7A9359", // Salbei
  "#5B7A9D", // Schiefer-Blau
  "#8B5A7C", // Pflaume
];

export function LoanAnalytics({ loans }: Props) {
  const currentYear = new Date().getFullYear();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(loans.map((l) => l.id)));

  const allSelected = selected.size === loans.length;
  const filtered = useMemo(() => loans.filter((l) => selected.has(l.id)), [loans, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) return new Set(loans.map((l) => l.id));
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(loans.map((l) => l.id)));
  }

  const balanceData = useMemo(() => buildBalanceData(filtered), [filtered]);
  const yearlyData = useMemo(() => buildYearlyData(filtered), [filtered]);

  // Thinning: für Restschuldchart max. ~60 Datenpunkte (alle 6 Monate)
  const balanceThinned = useMemo(
    () => balanceData.filter((_, i) => i % 6 === 0 || i === balanceData.length - 1),
    [balanceData]
  );

  // Stabile Farben anhand der Original-Reihenfolge
  const colorById = useMemo(
    () => new Map(loans.map((l, i) => [l.id, COLORS[i % COLORS.length]!])),
    [loans]
  );

  const filterBar = loans.length > 1 ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={selectAll}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          allSelected
            ? "bg-foreground text-background border-foreground"
            : "bg-background text-muted-foreground hover:bg-muted",
        )}
      >
        Alle ({loans.length})
      </button>
      {loans.map((l) => {
        const isActive = selected.has(l.id);
        const color = colorById.get(l.id)!;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => toggle(l.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
              isActive ? "bg-card border-foreground/40" : "bg-background text-muted-foreground opacity-60 hover:opacity-100",
            )}
          >
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />
            {l.description}
            <span className="text-muted-foreground/70 ml-0.5">· {l.property.street}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="space-y-10">
      <LoanProgressSection loans={loans} colorById={colorById} />

      <div className="space-y-6 pt-2 border-t">
        <div className="pt-6">
          <h2 className="text-base font-semibold">Zeitliche Entwicklung</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filterBar ? "Wähle einzelne Darlehen oder zeige alle" : "Verlauf und Prognose"}
          </p>
          {filterBar && <div className="mt-4">{filterBar}</div>}
        </div>

        {balanceThinned.length > 0 && (
          <BalanceChart data={balanceThinned} filtered={filtered} colorById={colorById} />
        )}
        {yearlyData.length > 0 && <YearlyInterestChart data={yearlyData} currentYear={currentYear} />}
        {yearlyData.length > 0 && <InterestVsPrincipalChart data={yearlyData} currentYear={currentYear} />}
      </div>
    </div>
  );
}
