"use client";

import { VpiChart, type VpiPoint, type VpiMark } from "./vpi-chart";
import { VpiFetchButton } from "./vpi-controls";
import type { VpiEntry } from "@/db/schema";

type Props = {
  initialEntries: VpiEntry[];
  marks: VpiMark[];
};

export function VpiPageClient({ initialEntries, marks }: Props) {
  const chartPoints: VpiPoint[] = initialEntries.map((e) => ({
    yearMonth: e.yearMonth,
    value: e.value,
  }));

  const sorted = [...initialEntries].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  const latest = sorted[0];
  const first = sorted[sorted.length - 1];

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              VPI-Verlauf · Basis 2020 = 100,0
            </p>
            {latest && first && latest !== first && (() => {
              const delta = latest.value - first.value;
              const pct = (delta / first.value) * 100;
              return (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Aktuell{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {latest.value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </span>
                  {" "}({latest.yearMonth}) · seit {first.yearMonth}{" "}
                  <span className={pct >= 0 ? "text-green-600" : "text-destructive"}>
                    {pct >= 0 ? "+" : ""}{pct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                  </span>
                </p>
              );
            })()}
          </div>
          <VpiFetchButton />
        </div>
        <VpiChart points={chartPoints} marks={marks} />
        {marks.length > 0 && (
          <div className="flex gap-4 mt-3 flex-wrap">
            {marks.some((m) => m.label === "Start") && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "oklch(0.461 0.054 207)" }} />
                Vertragsstart
              </div>
            )}
            {marks.some((m) => m.label === "Anpassung") && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "oklch(0.65 0.18 45)" }} />
                Mietanpassung
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
