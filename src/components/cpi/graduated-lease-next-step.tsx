import { Private } from "@/components/private";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { CalendarClock, CheckCircle2, Info } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import type { GraduatedLeaseNextStep } from "@/server/actions/cpi";

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

export function GraduatedLeaseNextStepList({ items }: { items: GraduatedLeaseNextStep[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Staffelmieten — nächste Stufe</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Vertraglich vereinbarte Erhöhungen (§ 557a BGB). Werden automatisch zum vereinbarten Datum wirksam.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map((it) => (
          <GraduatedCard key={it.leaseId} it={it} />
        ))}
      </div>
    </section>
  );
}

function GraduatedCard({ it }: { it: GraduatedLeaseNextStep }) {
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
        {it.nextStepDate && it.monthsUntilNext != null && (
          <div className="text-right shrink-0 text-primary">
            <p className="text-2xl font-bold tabular-nums flex items-center gap-1 justify-end">
              <CalendarClock className="size-5" />
              {it.monthsUntilNext} Mon.
            </p>
            <p className="text-[10px] text-muted-foreground">bis nächste Stufe</p>
          </div>
        )}
      </header>

      <div className="rounded-lg bg-muted/30 px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <p className="text-muted-foreground">Aktuelle Kaltmiete</p>
          <p className="text-sm font-semibold tabular-nums">{formatMoney(it.currentRentCents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{fmtSqm(it.currentRentPerSqmCents)} ({it.livingArea.toFixed(0)} m²)</p>
          <p className="text-sm text-muted-foreground">seit {formatDate(it.lastStepDate)}</p>
        </div>
      </div>

      {/* Sparkline: Staffelverlauf */}
      {it.stepsSeries.length >= 2 && (() => {
        const pastSteps = it.stepsSeries.filter((s) => !s.future);
        const futureSteps = it.stepsSeries.filter((s) => s.future);
        const todayPt = pastSteps.length > 0
          ? { date: it.todayDate, rentCents: pastSteps[pastSteps.length - 1]!.rentCents }
          : null;
        const pastPoints = [
          ...pastSteps.map((s) => ({ x: dateToDays(s.date), y: s.rentCents })),
          ...(todayPt ? [{ x: dateToDays(todayPt.date), y: todayPt.rentCents }] : []),
        ];
        const plannedPoints = futureSteps.length > 0
          ? futureSteps.map((s) => ({ x: dateToDays(s.date), y: s.rentCents }))
          : undefined;
        const first = it.stepsSeries[0]!;
        const last = it.stepsSeries[it.stepsSeries.length - 1]!;
        return (
          <Sparkline
            height={56}
            points={pastPoints}
            step
            lineColor="oklch(0.461 0.054 207)"
            fillBelow
            plannedPoints={plannedPoints}
            plannedLineColor="oklch(0.461 0.054 207)"
            vLine={{ x: dateToDays(it.todayDate), color: "oklch(0.5 0 0)" }}
            startLabel={`${formatMoney(first.rentCents)} · ${formatDate(first.date)}`}
            endLabel={`${formatMoney(last.rentCents)} · ${formatDate(last.date)}`}
            ariaLabel="Staffelverlauf"
          />
        );
      })()}

      {it.nextStepDate && it.nextStepRentCents != null ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-1">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium min-w-0 truncate">Nächste Stufe ({formatDate(it.nextStepDate)})</span>
            <span className="tabular-nums text-base font-bold text-primary">
              {formatMoney(it.nextStepRentCents)}
            </span>
          </div>
          {it.nextStepDeltaCents != null && (
            <p className="text-xs text-muted-foreground tabular-nums">
              +{formatMoney(it.nextStepDeltaCents)} ({fmtPercent(it.nextStepPercent)}) — automatisch wirksam
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <Info className="size-3.5 shrink-0 mt-0.5" />
          Letzte Staffel erreicht — keine weiteren Erhöhungen im Vertrag vereinbart.
        </p>
      )}

      {it.isFinalStep && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1">
          <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
          Ab sofort wie Festmiete behandelbar — Erhöhung nach § 558 BGB möglich.
        </p>
      )}
    </article>
  );
}
