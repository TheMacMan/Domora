import Link from "next/link";
import { getLoansAction } from "@/server/actions/loans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { projectBausparAllocation, type LoanForProjection } from "@/lib/loan-projection";
import { Plus, Pencil, AlertTriangle, BarChart2, Building2, ArrowRight, PiggyBank } from "lucide-react";

export const metadata = { title: "Darlehen – Domora" };

function fmt(bps: number) {
  return (bps / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

function calcPayoffDate(balanceCents: number, interestRateBps: number, monthlyPaymentCents: number, fromDate: string): string | null {
  const r = interestRateBps / 10000 / 12;
  const monthlyInterest = balanceCents * r;
  if (monthlyPaymentCents <= monthlyInterest) return null;
  const months = r === 0
    ? Math.ceil(balanceCents / monthlyPaymentCents)
    : Math.ceil(-Math.log(1 - (r * balanceCents) / monthlyPaymentCents) / Math.log(1 + r));
  const [y, m] = fromDate.split("-").map(Number) as [number, number];
  const end = new Date(y, m - 1 + months, 1);
  return end.toLocaleDateString("de-DE", { month: "short", year: "numeric" });
}

function interestFixedStatus(dateStr: string | null): "ok" | "soon" | "expired" | null {
  if (!dateStr) return null;
  const diffDays = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays <= 365) return "soon";
  return "ok";
}

function estimateMonthlyInterestCents(balanceCents: number, interestRateBps: number): number {
  return Math.round(balanceCents * interestRateBps / 10000 / 12);
}

type LoanRow = Awaited<ReturnType<typeof getLoansAction>>[number];

// Mit Restschuld gewichteter Mittelwert-Zinssatz in Basispunkten.
function weightedAvgRateBps(loans: LoanRow[]): number | null {
  const balanceSum = loans.reduce((s, l) => s + l.balanceCents, 0);
  if (balanceSum <= 0) return null;
  const weightedSum = loans.reduce((s, l) => s + l.balanceCents * l.interestRateBps, 0);
  return weightedSum / balanceSum;
}

// Sortiert Loans innerhalb einer Gruppe: verknüpfte Bauspar/Vorfinanzierungs-Paare
// stehen direkt nebeneinander (Vorfinanzierung zuerst, dann verknüpfter Bauspar).
function sortLinkedPairs(loans: LoanRow[]): LoanRow[] {
  const byId = new Map(loans.map((l) => [l.id, l]));
  const used = new Set<string>();
  const result: LoanRow[] = [];
  for (const l of loans) {
    if (used.has(l.id)) continue;
    result.push(l);
    used.add(l.id);
    if (l.loanType === "interest_only" && l.replacedByLoanId) {
      const bauspar = byId.get(l.replacedByLoanId);
      if (bauspar && !used.has(bauspar.id)) {
        result.push(bauspar);
        used.add(bauspar.id);
      }
    }
  }
  return result;
}

function bausparSavingsSum(loans: LoanRow[]): number {
  return loans.reduce((s, l) => s + (l.loanType === "bauspar" ? (l.bsSavingsBalanceCents ?? 0) : 0), 0);
}

// Aktuell fließende Monatsrate für ein Darlehen:
//   • Bauspar in Sparphase → Sparrate (TEL)
//   • Sonstige → monthlyPaymentCents
function effectiveMonthlyOutCents(loan: LoanRow): number {
  if (loan.loanType === "bauspar") return loan.bsMonthlySavingsCents ?? 0;
  return loan.monthlyPaymentCents;
}

function groupByProperty(loans: LoanRow[]) {
  const map = new Map<string, { propertyId: string; street: string; city: string; loans: LoanRow[]; balanceSum: number; paymentSum: number; avgRateBps: number | null; bausparSavings: number }>();
  for (const l of loans) {
    const key = l.propertyId;
    const out = effectiveMonthlyOutCents(l);
    const existing = map.get(key);
    if (existing) {
      existing.loans.push(l);
      existing.balanceSum += l.balanceCents;
      existing.paymentSum += out;
    } else {
      map.set(key, {
        propertyId: l.propertyId,
        street: l.property.street,
        city: l.property.city,
        loans: [l],
        balanceSum: l.balanceCents,
        paymentSum: out,
        avgRateBps: null,
        bausparSavings: 0,
      });
    }
  }
  // Aggregationen nach dem Einlesen
  const groups = Array.from(map.values()).map((g) => ({
    ...g,
    avgRateBps: weightedAvgRateBps(g.loans),
    bausparSavings: bausparSavingsSum(g.loans),
    loans: sortLinkedPairs(g.loans),
  }));
  return groups.sort((a, b) => b.balanceSum - a.balanceSum);
}

// "Ablöse-Datum" für eine Vorfinanzierung: voraussichtliche Zuteilung des verknüpften Bauspar
function calcReplacementDate(financing: LoanRow, allLoans: LoanRow[]): string | null {
  if (financing.loanType !== "interest_only" || !financing.replacedByLoanId) return null;
  const bauspar = allLoans.find((l) => l.id === financing.replacedByLoanId);
  if (!bauspar) return null;
  const alloc = projectBausparAllocation(bauspar as unknown as LoanForProjection);
  if (!alloc) return null;
  const [y, m] = alloc.yearMonth.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "short", year: "numeric" });
}

export default async function LoansPage() {
  const loanList = await getLoansAction();

  const totalBalanceCents = loanList.reduce((s, l) => s + l.balanceCents, 0);
  const totalBausparSavings = bausparSavingsSum(loanList);
  const totalNetBalance = totalBalanceCents - totalBausparSavings;
  const totalPaymentCents = loanList.reduce((s, l) => s + effectiveMonthlyOutCents(l), 0);
  const totalMonthlyInterestCents = loanList.reduce((s, l) => s + (l.loanType === "bauspar" ? 0 : estimateMonthlyInterestCents(l.balanceCents, l.interestRateBps)), 0);
  const totalMonthlyPrincipalCents = totalPaymentCents - totalMonthlyInterestCents;
  const warningCount = loanList.filter((l) => {
    const s = interestFixedStatus(l.interestFixedUntil ?? null);
    return s === "expired" || s === "soon";
  }).length;

  const groups = groupByProperty(loanList);
  const overallAvgRateBps = weightedAvgRateBps(loanList);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Darlehen</h1>
          {loanList.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {loanList.length} Darlehen · Restschuld gesamt {formatMoney(totalBalanceCents)} · {formatMoney(totalPaymentCents)}/Monat
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {loanList.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href="/loans/analysis">
                <BarChart2 className="size-4" />
                Auswertung
              </Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href="/loans/new">
              <Plus className="size-4" />
              Neues Darlehen
            </Link>
          </Button>
        </div>
      </div>

      {loanList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Restschuld gesamt</p>
            <p className="text-lg font-bold tabular-nums">{formatMoney(totalBalanceCents)}</p>
            {totalBausparSavings > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                netto <span className="font-medium text-foreground tabular-nums">{formatMoney(totalNetBalance)}</span>
                <span className="ml-1">(abzgl. {formatMoney(totalBausparSavings)} Bauspar)</span>
              </p>
            )}
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Rate/Monat gesamt</p>
            <p className="text-lg font-bold tabular-nums">{formatMoney(totalPaymentCents)}</p>
            {overallAvgRateBps != null && (
              <p className="text-xs text-muted-foreground mt-0.5">ø Zinssatz {fmt(overallAvgRateBps)} (gewichtet)</p>
            )}
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">davon Zinsen/Monat</p>
            <p className="text-lg font-bold tabular-nums text-amber-500">{formatMoney(totalMonthlyInterestCents)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Werbungskosten</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">davon Tilgung/Monat</p>
            <p className="text-lg font-bold tabular-nums text-green-500">{formatMoney(totalMonthlyPrincipalCents)}</p>
            {warningCount > 0 && (
              <p className="text-xs text-amber-500 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="size-3 shrink-0" />
                {warningCount} Zinsbindung{warningCount > 1 ? "en" : ""} prüfen
              </p>
            )}
          </div>
        </div>
      )}

      {loanList.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground rounded-xl border border-dashed">
          <p>Noch keine Darlehen erfasst.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/loans/new">Erstes Darlehen anlegen</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.propertyId}>
              {/* Objekt-Header */}
              <div className="flex items-center justify-between gap-3 mb-3 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">{group.street}, {group.city}</h2>
                    <p className="text-xs text-muted-foreground">
                      {group.loans.length} Darlehen · {formatMoney(group.balanceSum)} Restschuld
                      {group.bausparSavings > 0 && (
                        <> · netto <span className="font-medium text-foreground">{formatMoney(group.balanceSum - group.bausparSavings)}</span></>
                      )}
                      {group.loans.length > 1 && group.avgRateBps != null && (
                        <> · ø {fmt(group.avgRateBps)}</>
                      )}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="tabular-nums shrink-0">
                  {formatMoney(group.paymentSum)}/Mon.
                </Badge>
              </div>

              {/* Mobile: Cards */}
              <div className="space-y-2 md:hidden">
                {group.loans.map((l) => {
                  const fixedStatus = interestFixedStatus(l.interestFixedUntil ?? null);
                  const linkedBauspar = l.loanType === "interest_only" && l.replacedByLoanId
                    ? group.loans.find((x) => x.id === l.replacedByLoanId)
                    : null;
                  const linkedFinancing = l.loanType === "bauspar"
                    ? group.loans.find((x) => x.replacedByLoanId === l.id)
                    : null;
                  return (
                    <Link
                      key={l.id}
                      href={`/loans/${l.id}`}
                      className={`block rounded-xl border px-4 py-3 active:bg-muted/30 transition-colors ${
                        linkedBauspar || linkedFinancing
                          ? "border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10"
                          : "bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{l.description}</p>
                          {linkedBauspar && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                              <ArrowRight className="size-3 shrink-0" /> wird durch {linkedBauspar.description} abgelöst
                            </p>
                          )}
                          {linkedFinancing && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                              <PiggyBank className="size-3 shrink-0" /> löst {linkedFinancing.description} ab
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="tabular-nums font-semibold">{formatMoney(l.balanceCents)}</p>
                          {l.loanType === "bauspar" && l.bsSavingsBalanceCents != null && l.bsSavingsBalanceCents > 0 && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                              + {formatMoney(l.bsSavingsBalanceCents)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{fmt(l.interestRateBps)} p.a.</span>
                        <span>·</span>
                        {(() => {
                          const out = effectiveMonthlyOutCents(l);
                          if (out <= 0) return <span>–</span>;
                          if (l.loanType === "bauspar") return <span>{formatMoney(out)}/Mon. <em className="not-italic">(Sparrate)</em></span>;
                          return <span>{formatMoney(out)}/Mon.</span>;
                        })()}
                        {l.interestFixedUntil && fixedStatus !== "ok" && (
                          <>
                            <span>·</span>
                            <span className={`flex items-center gap-1 ${fixedStatus === "expired" ? "text-destructive" : "text-amber-500"}`}>
                              <AlertTriangle className="size-3 shrink-0" />
                              {formatDate(l.interestFixedUntil)}
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Desktop: Tabelle */}
              <div className="hidden md:block rounded-xl border overflow-x-auto bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-b">
                      <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
                      <th className="text-right px-4 py-3 font-medium">Zinssatz</th>
                      <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Zinsbindung bis</th>
                      <th className="text-right px-4 py-3 font-medium">Rate/Monat</th>
                      <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Laufzeitende</th>
                      <th className="text-right px-4 py-3 font-medium">Restschuld</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.loans.map((l) => {
                      const fixedStatus = interestFixedStatus(l.interestFixedUntil ?? null);
                      const linkedBauspar = l.loanType === "interest_only" && l.replacedByLoanId
                        ? group.loans.find((x) => x.id === l.replacedByLoanId)
                        : null;
                      const linkedFinancing = l.loanType === "bauspar"
                        ? group.loans.find((x) => x.replacedByLoanId === l.id)
                        : null;
                      const isLinkPair = !!(linkedBauspar || linkedFinancing);
                      // Für Vorfinanzierungen: Ablösedatum statt unsinnigem Laufzeitende
                      const replacementDate = linkedBauspar ? calcReplacementDate(l, loanList) : null;
                      const payoff = l.loanType === "interest_only"
                        ? replacementDate
                        : calcPayoffDate(l.balanceCents, l.interestRateBps, l.monthlyPaymentCents, l.balanceDate);
                      return (
                        <tr key={l.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isLinkPair ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                          <td className="px-4 py-3 font-medium">
                            <Link href={`/loans/${l.id}`} className="hover:underline">
                              {l.description}
                            </Link>
                            {linkedBauspar && (
                              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5 font-normal">
                                <ArrowRight className="size-3 shrink-0" /> wird durch {linkedBauspar.description} abgelöst
                              </p>
                            )}
                            {linkedFinancing && (
                              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5 font-normal">
                                <PiggyBank className="size-3 shrink-0" /> löst {linkedFinancing.description} ab
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(l.interestRateBps)}</td>
                          <td className="px-4 py-3 text-right hidden lg:table-cell">
                            {l.interestFixedUntil ? (
                              <span className={`inline-flex items-center gap-1 text-sm tabular-nums ${fixedStatus === "expired" ? "text-destructive" : fixedStatus === "soon" ? "text-amber-500" : "text-muted-foreground"}`}>
                                {fixedStatus !== "ok" && <AlertTriangle className="size-3 shrink-0" />}
                                {formatDate(l.interestFixedUntil)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">–</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {(() => {
                              const out = effectiveMonthlyOutCents(l);
                              if (out <= 0) return <span className="text-xs text-muted-foreground">–</span>;
                              return (
                                <>
                                  {formatMoney(out)}
                                  {l.loanType === "bauspar" && (
                                    <p className="text-xs font-normal text-muted-foreground mt-0.5">Sparrate</p>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell">{payoff ?? "–"}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {formatMoney(l.balanceCents)}
                            {l.loanType === "bauspar" && l.bsSavingsBalanceCents != null && l.bsSavingsBalanceCents > 0 && (
                              <p className="text-xs font-normal text-emerald-600 dark:text-emerald-400 mt-0.5">
                                + {formatMoney(l.bsSavingsBalanceCents)} gespart
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button asChild variant="ghost" size="icon">
                              <Link href={`/loans/${l.id}/edit`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Summenzeile pro Gruppe */}
                    {group.loans.length > 1 && (
                      <tr className="bg-muted/20 font-medium">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wider">Σ Objekt</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground" title="Gewichtet nach Restschuld">
                          {group.avgRateBps != null ? `ø ${fmt(group.avgRateBps)}` : ""}
                        </td>
                        <td className="px-4 py-2.5 hidden lg:table-cell" />
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(group.paymentSum)}</td>
                        <td className="px-4 py-2.5 hidden lg:table-cell" />
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatMoney(group.balanceSum)}
                          {group.bausparSavings > 0 && (
                            <p className="text-xs font-normal text-muted-foreground mt-0.5">
                              netto <span className="text-foreground tabular-nums">{formatMoney(group.balanceSum - group.bausparSavings)}</span>
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
