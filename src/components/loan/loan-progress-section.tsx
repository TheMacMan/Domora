import { formatMoneyShort } from "@/lib/money";
import { projectSchedule, type LoanForProjection } from "@/lib/loan-projection";

type Props = {
  loans: LoanForProjection[];
  colorById: Map<string, string>;
};

export function LoanProgressSection({ loans, colorById }: Props) {
  const progressLoans = loans.map((l) => {
    const schedule = projectSchedule(l);
    const totalPrincipalPaid = l.initialAmountCents != null
      ? Math.max(0, l.initialAmountCents - l.balanceCents)
      : l.loanPayments.reduce((s, p) => s + p.principalCents, 0);
    const initial = l.initialAmountCents ?? (l.balanceCents + totalPrincipalPaid);
    const pct = initial > 0 ? Math.min(100, (totalPrincipalPaid / initial) * 100) : 0;
    const lastBalance = schedule.at(-1)?.balanceAfterCents ?? l.balanceCents;
    return { loan: l, initial, pct, lastBalance, totalPrincipalPaid };
  });

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold">Tilgungsfortschritt</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Stand heute · alle Darlehen</p>
      </div>
      <div className="space-y-4">
        {progressLoans.map(({ loan, initial, pct, totalPrincipalPaid }) => (
          <div key={loan.id} className="rounded-xl border bg-card px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-sm">{loan.description}</p>
                <p className="text-xs text-muted-foreground">{loan.property.street}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {(loan.balanceCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                </p>
                {loan.initialAmountCents != null && (
                  <p className="text-xs text-muted-foreground">von {formatMoneyShort(initial)}</p>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: colorById.get(loan.id) }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                {loan.initialAmountCents != null
                  ? `${pct.toFixed(1)} % getilgt · ${formatMoneyShort(totalPrincipalPaid)} abbezahlt`
                  : totalPrincipalPaid > 0
                    ? `${formatMoneyShort(totalPrincipalPaid)} getilgt (seit Erfassung)`
                    : "Tilgungsplan generieren für Fortschritt"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
