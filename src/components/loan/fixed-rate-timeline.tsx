import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { FixedRateItem, FixedRateStatus } from "@/lib/loan-projection";

const STATUS: Record<FixedRateStatus, { bar: string; text: string; label: string }> = {
  expired:  { bar: "bg-red-500",    text: "text-destructive", label: "abgelaufen" },
  urgent:   { bar: "bg-red-500",    text: "text-destructive", label: "läuft in < 6 Monaten aus" },
  soon:     { bar: "bg-amber-500",  text: "text-amber-600",   label: "läuft in < 2 Jahren aus" },
  ok:       { bar: "bg-primary/70", text: "text-muted-foreground", label: "" },
  paid_off: { bar: "bg-green-500",  text: "text-green-600",   label: "vor Ablauf getilgt" },
  unknown:  { bar: "bg-muted",      text: "text-muted-foreground", label: "keine Zinsbindung erfasst" },
};

function remaining(months: number) {
  if (months < 0) return "abgelaufen";
  if (months < 1) return "< 1 Monat";
  if (months < 24) return `${months} Monate`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m === 0 ? `${y} Jahre` : `${y} J. ${m} M.`;
}

export function FixedRateTimeline({ items, today }: { items: FixedRateItem[]; today: string }) {
  const dated = items.filter((i) => i.fixedUntil);
  const maxMonths = Math.max(12, ...dated.map((i) => i.monthsLeft ?? 0));
  const startYear = parseInt(today.slice(0, 4), 10);
  const endYear = startYear + Math.ceil(maxMonths / 12);
  const tickStep = endYear - startYear > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let y = startYear + 1; y <= endYear; y += tickStep) ticks.push(y);
  const pos = (months: number) => `${Math.max(0, Math.min(100, (months / maxMonths) * 100))}%`;
  const monthsToYearStart = (y: number) => (y - startYear) * 12 - (parseInt(today.slice(5, 7), 10) - 1);

  const dueSoon = items.filter((i) => i.status === "urgent" || i.status === "expired");
  const dueSoonBalance = dueSoon.reduce((s, i) => s + (i.balanceAtEndCents ?? 0), 0);

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="font-semibold">Zinsbindungen</h2>
        <p className="text-xs text-muted-foreground">
          Ablauf der Zinsbindung und voraussichtliche Restschuld zu diesem Zeitpunkt (Projektion mit aktueller Rate)
        </p>
      </div>

      {dueSoon.length > 0 && (
        <div className="mx-4 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm sm:mx-5">
          <strong>{dueSoon.length === 1 ? "1 Zinsbindung läuft" : `${dueSoon.length} Zinsbindungen laufen`} in den nächsten 6 Monaten aus</strong>
          {dueSoonBalance > 0 && <> — Anschlussfinanzierung für rund {formatMoney(dueSoonBalance)} klären.</>}
        </div>
      )}

      <div className="px-4 py-4 sm:px-5">
        {/* Jahresachse */}
        <div className="relative mb-2 ml-0 h-4 sm:ml-[13.75rem]">
          {ticks.map((y) => (
            <span
              key={y}
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ left: pos(monthsToYearStart(y)) }}
            >
              {y}
            </span>
          ))}
        </div>

        <ul className="space-y-3">
          {items.map((i) => {
            const st = STATUS[i.status];
            return (
              <li key={i.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <Link href={`/loans/${i.id}`} className="min-w-0 hover:underline sm:w-52 sm:shrink-0">
                  <span className="block truncate text-sm font-medium">{i.description}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.contractNumber ? `${i.contractNumber} · ` : ""}{i.property}
                  </span>
                </Link>
                <div className="flex-1">
                  <div className="relative h-5 rounded bg-muted/40">
                    {ticks.map((y) => (
                      <span key={y} className="absolute inset-y-0 w-px bg-border" style={{ left: pos(monthsToYearStart(y)) }} />
                    ))}
                    {i.fixedUntil && i.monthsLeft != null && (
                      <span
                        className={`absolute inset-y-0 left-0 rounded ${st.bar}`}
                        style={{ width: i.monthsLeft <= 0 ? "4px" : pos(i.monthsLeft) }}
                      />
                    )}
                  </div>
                  <p className={`mt-1 text-xs tabular-nums ${st.text}`}>
                    {i.fixedUntil ? (
                      <>
                        bis {formatDate(i.fixedUntil)} · {remaining(i.monthsLeft ?? 0)} · {(i.interestRateBps / 100).toLocaleString("de-DE")} %
                        {i.status === "paid_off" && i.payoffDate
                          ? ` · getilgt ${formatDate(i.payoffDate)}`
                          : i.balanceAtEndCents != null && ` · Restschuld dann ${formatMoney(i.balanceAtEndCents)}`}
                        {st.label && i.status !== "paid_off" && ` · ${st.label}`}
                      </>
                    ) : (
                      st.label
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
