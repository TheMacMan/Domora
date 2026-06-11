import { Private } from "@/components/private";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { AlertTriangle, CheckCircle2, TrendingUp, Info, CalendarClock } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import type { FixedLeasePotential } from "@/server/actions/cpi";

function dateToDays(d: string): number {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
}

function fmtSqm(centsPerSqm: number): string {
  return `${(centsPerSqm / 100).toFixed(2).replace(".", ",")} €/m²`;
}
function fmtPercent(p: number | null): string {
  if (p == null) return "–";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2).replace(".", ",")} %`;
}

export function FixedLeasePotentialList({ items }: { items: FixedLeasePotential[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Festmieten — Anpassungspotential</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Erhöhung auf ortsübliche Vergleichsmiete nach § 558 BGB. Sortiert nach möglichem Mehrbetrag.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map((it) => (
          <FixedCard key={it.leaseId} it={it} />
        ))}
      </div>
    </section>
  );
}

function FixedCard({ it }: { it: FixedLeasePotential }) {
  const hasReference = it.referenceRentCentsPerSqm != null && it.targetRentCents != null;
  const showsPotential = it.potentialDeltaCents != null && it.potentialDeltaCents > 0;

  return (
    <article className="rounded-xl border bg-card p-4 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium">{it.unitName}</p>
          <p className="text-xs text-muted-foreground">{it.propertyLabel}</p>
          {it.tenantsLabel && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <Private>{it.tenantsLabel}</Private>
            </p>
          )}
        </div>
        {showsPotential && (
          <div className="text-right shrink-0 text-emerald-600 dark:text-emerald-400">
            <p className="text-2xl font-bold tabular-nums flex items-center gap-1 justify-end">
              <TrendingUp className="size-5" />
              +{formatMoney(it.potentialDeltaCents!)}
            </p>
            <p className="text-[10px] text-muted-foreground">möglich / Monat</p>
          </div>
        )}
      </header>

      {/* Kompakter Header: aktuelle Werte */}
      <div className="rounded-lg bg-muted/30 px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <p className="text-muted-foreground">Aktuelle Kaltmiete</p>
          <p className="text-sm font-semibold tabular-nums">{formatMoney(it.currentRentCents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{fmtSqm(it.currentRentPerSqmCents)} ({it.livingArea.toFixed(0)} m²)</p>
          {hasReference && (
            <p className="text-sm tabular-nums">
              <span className="text-muted-foreground">Ziel: </span>
              <span className="font-semibold">{fmtSqm(it.referenceRentCentsPerSqm!)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Sparkline: Mietentwicklung + Schranken */}
      {it.rentSeries.length >= 2 && (
        <Sparkline
          height={56}
          points={it.rentSeries.map((p) => ({ x: dateToDays(p.date), y: p.rentCents }))}
          step
          lineColor="oklch(0.461 0.054 207)"
          fillBelow
          plannedPoints={
            it.plannedRentPoint
              ? [
                  { x: dateToDays(it.plannedRentPoint.date), y: it.currentRentCents },
                  { x: dateToDays(it.plannedRentPoint.date), y: it.plannedRentPoint.rentCents },
                ]
              : undefined
          }
          plannedLineColor="oklch(0.65 0.18 45)"
          hLines={[
            { y: it.capLimitCents, color: "oklch(0.65 0.18 145)", label: "Kappung" },
            ...(it.targetRentCents != null
              ? [{ y: it.targetRentCents, color: "oklch(0.65 0.18 45)", label: "Ziel" }]
              : []),
          ]}
          vLine={{ x: dateToDays(it.todayDate), color: "oklch(0.5 0 0)" }}
          startLabel={`${formatMoney(it.rentSeries[0]!.rentCents)} · ${formatDate(it.rentSeries[0]!.date)}`}
          endLabel={
            it.plannedRentPoint
              ? `${formatMoney(it.plannedRentPoint.rentCents)} · ${formatDate(it.plannedRentPoint.date)}`
              : `${formatMoney(it.currentRentCents)} · heute`
          }
          ariaLabel="Mietentwicklung mit Kappungsgrenze und Vergleichsmiete"
        />
      )}

      {/* Geplante künftige Anpassung — wenn vorhanden */}
      {it.plannedAdjustmentDate && it.plannedAdjustmentRentCents != null && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs flex items-center gap-1.5 min-w-0">
            <CalendarClock className="size-3.5 text-primary shrink-0" />
            <span className="truncate">Geplante Anpassung ({formatDate(it.plannedAdjustmentDate)})</span>
          </span>
          <span className="text-sm font-semibold tabular-nums text-primary whitespace-nowrap">
            {formatMoney(it.plannedAdjustmentRentCents)}
            {it.plannedAdjustmentDeltaCents != null && (
              <span className="text-xs ml-1 opacity-80">
                ({it.plannedAdjustmentDeltaCents >= 0 ? "+" : ""}{formatMoney(it.plannedAdjustmentDeltaCents)})
              </span>
            )}
          </span>
        </div>
      )}

      {/* Detail-Zeilen */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-2 flex-wrap">
          <span className="text-muted-foreground">{it.referenceLabel} ({formatDate(it.referenceDate)})</span>
          <span className="text-muted-foreground tabular-nums">
            {it.monthsSinceReference >= 0
              ? `vor ${it.monthsSinceReference} Mon.`
              : `in ${-it.monthsSinceReference} Mon.`}
          </span>
        </div>

        <div className="flex justify-between gap-2 flex-wrap">
          <span className="text-muted-foreground">Kappungsgrenze (+20 % in 3 J.)</span>
          <span className="tabular-nums">
            {formatMoney(it.capLimitCents)}
            <span className={`ml-1 text-xs ${it.capHeadroomCents > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
              ({it.capHeadroomCents >= 0 ? "+" : ""}{formatMoney(it.capHeadroomCents)})
            </span>
          </span>
        </div>

        {hasReference ? (
          <div className="flex justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Ziel-Miete (Vergleichsmiete × m²)</span>
            <span className="tabular-nums">
              {formatMoney(it.targetRentCents!)}
              {it.targetDeltaCents != null && (
                <span className={`ml-1 text-xs ${it.targetDeltaCents > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  ({it.targetDeltaCents >= 0 ? "+" : ""}{formatMoney(it.targetDeltaCents)})
                </span>
              )}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic flex items-start gap-1">
            <Info className="size-3.5 shrink-0 mt-0.5" />
            Vergleichsmiete am Objekt nicht hinterlegt — Ziel-Miete kann nicht berechnet werden.
          </p>
        )}

        {it.vpiDriftPercent != null && (
          <div className="flex justify-between gap-2 pt-1 border-t">
            <span className="text-muted-foreground">VPI-Drift seit Referenz (info)</span>
            <span className="tabular-nums">
              {fmtPercent(it.vpiDriftPercent)}
              <span className="ml-1 text-xs text-muted-foreground">≈ {formatMoney(it.vpiNeutralRentCents!)} neutral</span>
            </span>
          </div>
        )}
      </div>

      {/* Realisierbares Potential */}
      {showsPotential && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">Mögliche neue Kaltmiete</span>
          <span className="tabular-nums text-base font-bold text-emerald-700 dark:text-emerald-400">
            {formatMoney(it.potentialNewRentCents!)}
          </span>
        </div>
      )}

      {/* Sperrfrist-Status */}
      {it.blocked ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          Sperrfrist bis {formatDate(it.blockedUntil)} (§ 558 Abs. 1 BGB — frühestens 12 Monate
          {it.plannedAdjustmentDate ? " nach geplanter Anpassung" : " nach letzter Anpassung"})
        </p>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1">
          <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
          Erhöhung möglich — Zustimmung des Mieters erforderlich (§ 558a BGB)
        </p>
      )}
    </article>
  );
}
