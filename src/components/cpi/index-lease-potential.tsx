import { Private } from "@/components/private";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { AlertTriangle, CheckCircle2, TrendingUp, CalendarClock } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import type { IndexLeasePotential } from "@/server/actions/cpi";

function ymToDays(ym: string): number {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return Math.floor(Date.UTC(y, m - 1, 1) / 86400000);
}

const monthYearFmt = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric" });
function formatYearMonth(ym: string | null): string {
  if (!ym) return "–";
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return monthYearFmt.format(new Date(Number(y), Number(m) - 1, 1));
}

function formatPercent(p: number | null): string {
  if (p == null) return "–";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2).replace(".", ",")} %`;
}

function formatVpi(v: number | null): string {
  if (v == null) return "–";
  return v.toFixed(1).replace(".", ",");
}

export function IndexLeasePotentialList({ items }: { items: IndexLeasePotential[] }) {
  if (items.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-1">Indexmieten — Erhöhungspotential</h2>
        <p className="text-sm text-muted-foreground">
          Keine aktiven Mietverträge mit Index-Klausel vorhanden.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Indexmieten — Erhöhungspotential</h2>
        <p className="text-sm text-muted-foreground mt-1">
          VPI-Anstieg seit der letzten Anpassung bzw. dem Vertragsbeginn nach § 557b BGB.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map((it) => (
          <PotentialCard key={it.leaseId} it={it} />
        ))}
      </div>
    </section>
  );
}

function PotentialCard({ it }: { it: IndexLeasePotential }) {
  const hasData = it.changePercent != null && it.potentialRentCents != null;
  const positive = (it.changePercent ?? 0) > 0;

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
        {hasData && (
          <div className={`text-right shrink-0 ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
            <p className="text-2xl font-bold tabular-nums flex items-center gap-1 justify-end">
              <TrendingUp className="size-5" />
              {formatPercent(it.changePercent)}
            </p>
            <p className="text-[10px] text-muted-foreground">VPI-Anstieg</p>
          </div>
        )}
      </header>

      {/* Sparkline: VPI-Verlauf seit Referenz */}
      {it.vpiSeries.length >= 2 && (
        <Sparkline
          height={48}
          points={it.vpiSeries.map((p) => ({ x: ymToDays(p.yearMonth), y: p.value }))}
          lineColor="oklch(0.461 0.054 207)"
          fillBelow
          markers={[
            ...(it.referenceVpi != null
              ? [{ x: ymToDays(it.referenceYearMonth), y: it.referenceVpi, color: "oklch(0.65 0.18 45)" }]
              : []),
            ...(it.currentVpi != null && it.currentYearMonth
              ? [{ x: ymToDays(it.currentYearMonth), y: it.currentVpi, color: "oklch(0.461 0.054 207)" }]
              : []),
          ]}
          startLabel={it.referenceVpi != null ? `VPI ${it.referenceVpi.toFixed(1).replace(".", ",")} (${formatYearMonth(it.referenceYearMonth)})` : undefined}
          endLabel={it.currentVpi != null && it.currentYearMonth ? `VPI ${it.currentVpi.toFixed(1).replace(".", ",")} (${formatYearMonth(it.currentYearMonth)})` : undefined}
          ariaLabel="VPI-Verlauf seit Referenzmonat"
        />
      )}

      <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs space-y-1">
        <div className="flex justify-between gap-3 flex-wrap">
          <span className="text-muted-foreground min-w-0">{it.referenceLabel} ({formatDate(it.referenceDate)})</span>
          <span className="tabular-nums font-medium">
            VPI {formatVpi(it.referenceVpi)}
            <span className="text-muted-foreground ml-1">({formatYearMonth(it.referenceYearMonth)})</span>
          </span>
        </div>
        <div className="flex justify-between gap-3 flex-wrap">
          <span className="text-muted-foreground min-w-0">Aktueller VPI</span>
          <span className="tabular-nums font-medium">
            VPI {formatVpi(it.currentVpi)}
            <span className="text-muted-foreground ml-1">({formatYearMonth(it.currentYearMonth)})</span>
          </span>
        </div>
      </div>

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

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm gap-2 flex-wrap">
          <span className="text-muted-foreground min-w-0">Aktuelle Kaltmiete</span>
          <span className="tabular-nums font-medium">{formatMoney(it.currentRentCents)}</span>
        </div>
        <div className="flex justify-between text-sm gap-2 flex-wrap">
          <span className="text-muted-foreground min-w-0">
            {it.plannedAdjustmentDate ? "Mögliche Folgemiete (nach geplanter Anpassung)" : "Mögliche neue Kaltmiete"}
          </span>
          <span className="tabular-nums font-semibold">
            {it.potentialRentCents != null ? formatMoney(it.potentialRentCents) : "–"}
          </span>
        </div>
        {it.potentialDeltaCents != null && it.potentialDeltaCents !== 0 && (
          <div className="flex justify-between text-sm pt-1 border-t gap-2 flex-wrap">
            <span className="text-muted-foreground">Mehrbetrag / Monat</span>
            <span className={`tabular-nums font-semibold ${it.potentialDeltaCents > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
              {it.potentialDeltaCents > 0 ? "+" : ""}{formatMoney(it.potentialDeltaCents)}
            </span>
          </div>
        )}
      </div>

      {!hasData && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          VPI-Wert für Referenz- oder aktuellen Monat fehlt — bitte VPI-Daten von Destatis aktualisieren.
        </p>
      )}

      {hasData && (
        it.blocked ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            Sperrfrist bis {formatDate(it.blockedUntil!)} (§ 557b BGB — frühestens 12 Monate
            {it.plannedAdjustmentDate ? " nach geplanter Anpassung" : " nach letzter Anpassung"})
          </p>
        ) : (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1">
            <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
            Erhöhung ab heute möglich (Sperrfrist seit {formatDate(it.blockedUntil!)} abgelaufen)
          </p>
        )
      )}
    </article>
  );
}
