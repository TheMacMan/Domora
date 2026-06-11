import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getLoanAction, generateLoanPaymentsAction, generateFullLoanPaymentsAction, resetFutureLoanPaymentsAction, markLoanPaymentPaidAction, executeBausparAllocationAction } from "@/server/actions/loans";
import { db } from "@/db";
import { loans as loansTable } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate, formatMonthLong as formatMonth, todayLocal } from "@/lib/dates";
import { Pencil, CheckCircle2, CalendarPlus, AlertTriangle, RotateCcw, Calendar, ArrowRight, PiggyBank, Sparkles } from "lucide-react";

function calcPayoffDate(balanceCents: number, interestRateBps: number, monthlyPaymentCents: number, fromDate: string): string | null {
  const r = interestRateBps / 10000 / 12;
  const monthlyInterest = balanceCents * r;
  if (monthlyPaymentCents <= monthlyInterest) return null;
  const months = r === 0
    ? Math.ceil(balanceCents / monthlyPaymentCents)
    : Math.ceil(-Math.log(1 - (r * balanceCents) / monthlyPaymentCents) / Math.log(1 + r));
  const [y, m] = fromDate.split("-").map(Number) as [number, number];
  const end = new Date(y, m - 1 + months, 1);
  return end.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function interestFixedStatus(dateStr: string | null): "ok" | "soon" | "expired" | null {
  if (!dateStr) return null;
  const diffDays = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays <= 365) return "soon";
  return "ok";
}

// Schätzt Zinsen YTD mathematisch wenn keine Raten generiert sind (H)
function estimateInterestYTD(balanceCents: number, interestRateBps: number, balanceDate: string): number {
  const r = interestRateBps / 10000 / 12;
  const startMonth = Math.max(1, parseInt(balanceDate.slice(5, 7), 10));
  const monthsThisYear = new Date().getMonth() + 1 - startMonth + 1;
  if (monthsThisYear <= 0) return 0;
  return Math.round(balanceCents * r * monthsThisYear);
}

export const metadata = { title: "Darlehen – Domora" };

function fmt(bps: number) {
  return (bps / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

type LoanRow = typeof loansTable.$inferSelect;

function calcBausparZuteilung(loan: LoanRow): {
  savingsRatio: number | null;
  minRatioOk: boolean;
  ratingOk: boolean;
  allOk: boolean;
  projectedDate: string | null;
} {
  const minPermille = loan.bsMinSavingsPermille;
  const totalSum = loan.bsTotalSumCents;
  const balance = loan.bsSavingsBalanceCents;
  const monthly = loan.bsMonthlySavingsCents ?? 0;
  const ratingTarget = loan.bsTargetRatingNumber;
  const ratingCurrent = loan.bsCurrentRatingNumber;

  const savingsRatio = totalSum && balance != null ? balance / totalSum : null;
  const minRatio = minPermille != null ? minPermille / 1000 : null;
  const minRatioOk = savingsRatio != null && minRatio != null ? savingsRatio >= minRatio : false;
  const ratingOk = ratingTarget != null && ratingCurrent != null ? ratingCurrent >= ratingTarget : false;
  const allOk = minRatioOk && ratingOk;

  // Projektion: wann ist Mindestsparquote erreicht (rein linear über Sparrate, Bewertungszahl-Projektion vernachlässigt)
  let projectedDate: string | null = null;
  if (!allOk && totalSum && balance != null && minRatio != null && monthly > 0) {
    const target = totalSum * minRatio;
    if (balance < target) {
      const monthsNeeded = Math.ceil((target - balance) / monthly);
      const d = new Date();
      d.setMonth(d.getMonth() + monthsNeeded);
      projectedDate = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    } else {
      projectedDate = "heute (Sparquote erfüllt)";
    }
  }

  return { savingsRatio, minRatioOk, ratingOk, allOk, projectedDate };
}

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loan = await getLoanAction(id);

  if (!loan) notFound();

  // Verknüpfte Darlehen laden (Vorfinanzierung → Bauspar, oder umgekehrt)
  const linkedReplacement = loan.replacedByLoanId
    ? await db.query.loans.findFirst({ where: eq(loansTable.id, loan.replacedByLoanId) })
    : null;
  const linkedReplaces = loan.loanType === "bauspar"
    ? await db.query.loans.findFirst({ where: eq(loansTable.replacedByLoanId, loan.id) })
    : null;

  const bausparStatus = loan.loanType === "bauspar" ? calcBausparZuteilung(loan as LoanRow) : null;

  const today = todayLocal();
  const currentYear = new Date().getFullYear();
  const paidCount = loan.loanPayments.filter((p) => p.paidAt).length;
  const hasPaymentsThisYear = loan.loanPayments.some((p) => p.dueDate.startsWith(String(currentYear)));

  // H: Wenn keine Raten für das aktuelle Jahr generiert, mathematische Schätzung
  const interestYTD = hasPaymentsThisYear
    ? loan.loanPayments.filter((p) => p.dueDate.startsWith(String(currentYear))).reduce((s, p) => s + p.interestCents, 0)
    : estimateInterestYTD(loan.balanceCents, loan.interestRateBps, loan.balanceDate);
  const interestYTDIsEstimate = !hasPaymentsThisYear;

  const payoffDate = calcPayoffDate(loan.balanceCents, loan.interestRateBps, loan.monthlyPaymentCents, loan.balanceDate);
  const fixedStatus = interestFixedStatus(loan.interestFixedUntil ?? null);

  const hasUnpaidFuture = loan.loanPayments.some((p) => !p.paidAt && p.dueDate > today);

  // Laufzeit seit startDate
  const laufzeitSeit = loan.startDate
    ? (() => {
        const start = new Date(loan.startDate);
        const now = new Date();
        const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
        const years = Math.floor(months / 12);
        const rem = months % 12;
        return years > 0 ? `${years} J. ${rem} Mon.` : `${rem} Mon.`;
      })()
    : null;

  async function generate() {
    "use server";
    await generateLoanPaymentsAction(id);
    revalidatePath(`/loans/${id}`);
  }

  async function generateFull() {
    "use server";
    await generateFullLoanPaymentsAction(id);
    revalidatePath(`/loans/${id}`);
  }

  async function resetFuture() {
    "use server";
    await resetFutureLoanPaymentsAction(id);
    revalidatePath(`/loans/${id}`);
  }

  async function markPaid(formData: FormData) {
    "use server";
    const paymentId = formData.get("paymentId") as string;
    await markLoanPaymentPaidAction(paymentId);
    revalidatePath(`/loans/${id}`);
  }

  async function executeAllocation() {
    "use server";
    await executeBausparAllocationAction(id);
    revalidatePath(`/loans/${id}`);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{loan.description}</h1>
            {loan.loanType === "interest_only" && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">Vorfinanzierung</Badge>
            )}
            {loan.loanType === "bauspar" && (
              <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300">Bausparvertrag</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{loan.property.street}, {loan.property.city}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/loans/${id}/edit`}>
            <Pencil className="size-4" />
            Bearbeiten
          </Link>
        </Button>
      </div>

      {/* Verknüpfungs-Banner */}
      {loan.loanType === "interest_only" && linkedReplacement && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10 px-4 py-3 flex items-center gap-3 flex-wrap">
          <ArrowRight className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Wird abgelöst durch Bausparvertrag</p>
            <Link href={`/loans/${linkedReplacement.id}`} className="text-sm text-primary hover:underline">
              {linkedReplacement.description} →
            </Link>
          </div>
        </div>
      )}
      {loan.loanType === "bauspar" && linkedReplaces && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10 px-4 py-3 flex items-center gap-3 flex-wrap">
          <PiggyBank className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Löst ab</p>
            <Link href={`/loans/${linkedReplaces.id}`} className="text-sm text-primary hover:underline">
              {linkedReplaces.description} →
            </Link>
          </div>
        </div>
      )}

      {/* Sparfortschritt Bausparvertrag */}
      {loan.loanType === "bauspar" && bausparStatus && loan.bsTotalSumCents != null && (
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <PiggyBank className="size-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-semibold">Sparfortschritt</h2>
            {bausparStatus.allOk && (
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ml-auto">
                Zuteilungsreif
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sparguthaben</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(loan.bsSavingsBalanceCents ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                von {formatMoney(loan.bsTotalSumCents)} ({bausparStatus.savingsRatio != null ? (bausparStatus.savingsRatio * 100).toFixed(1) : "–"} %)
              </p>
            </div>
            {loan.bsMonthlySavingsCents != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sparrate / TEL</p>
                <p className="text-lg font-bold tabular-nums">{formatMoney(loan.bsMonthlySavingsCents)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">monatlich</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {bausparStatus.savingsRatio != null && loan.bsMinSavingsPermille != null && (
            <div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${bausparStatus.minRatioOk ? "bg-emerald-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(100, bausparStatus.savingsRatio * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>0 %</span>
                <span className="text-foreground">Mindestsparquote {loan.bsMinSavingsPermille / 10} %</span>
                <span>100 %</span>
              </div>
            </div>
          )}

          {/* Zuteilungs-Kriterien */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              {bausparStatus.minRatioOk ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              ) : (
                <div className="size-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
              )}
              <span className={bausparStatus.minRatioOk ? "" : "text-muted-foreground"}>
                Mindestsparquote erreicht
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {bausparStatus.ratingOk ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              ) : (
                <div className="size-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
              )}
              <span className={bausparStatus.ratingOk ? "" : "text-muted-foreground"}>
                Bewertungszahl erreicht
                {loan.bsTargetRatingNumber != null && loan.bsCurrentRatingNumber != null && (
                  <span className="ml-1 text-xs">({loan.bsCurrentRatingNumber} / {loan.bsTargetRatingNumber})</span>
                )}
              </span>
            </div>
          </div>

          {!bausparStatus.allOk && bausparStatus.projectedDate && (
            <p className="text-xs text-muted-foreground pt-1">
              Mindestsparquote voraussichtlich erreicht: <span className="font-medium text-foreground">{bausparStatus.projectedDate}</span>
              {!bausparStatus.ratingOk && " · Bewertungszahl muss zusätzlich erreicht werden"}
            </p>
          )}

          {/* Zuteilung durchführen */}
          <div className={`mt-2 rounded-lg border p-3 ${bausparStatus.allOk ? "border-emerald-500/40 bg-emerald-500/5" : "border-dashed"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="size-4 text-emerald-500" />
                  Zuteilung durchführen
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Wandelt den Bausparvertrag in ein Annuitätendarlehen um:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    Restschuld {formatMoney(Math.max(0, (loan.bsTotalSumCents ?? 0) - (loan.bsSavingsBalanceCents ?? 0)))}
                  </span>
                  {loan.bsLoanInterestBps != null && ` zu ${(loan.bsLoanInterestBps / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} %`}
                  {loan.bsLoanMonthlyPaymentCents != null && ` mit ${formatMoney(loan.bsLoanMonthlyPaymentCents)}/Monat`}.
                  {linkedReplaces && (
                    <> Die verknüpfte Vorfinanzierung <em>{linkedReplaces.description}</em> wird gleichzeitig abgelöst.</>
                  )}
                </p>
              </div>
              <form action={executeAllocation}>
                <Button
                  type="submit"
                  size="sm"
                  variant={bausparStatus.allOk ? "default" : "outline"}
                  disabled={loan.bsLoanInterestBps == null || loan.bsLoanMonthlyPaymentCents == null}
                  title={loan.bsLoanInterestBps == null || loan.bsLoanMonthlyPaymentCents == null ? "Zinssatz und Rate nach Zuteilung müssen erfasst sein" : undefined}
                >
                  <Sparkles className="size-4" />
                  Jetzt zuteilen
                </Button>
              </form>
            </div>
          </div>
        </section>
      )}

      {/* Kennzahlen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Restschuld</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(loan.balanceCents)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            per {formatDate(loan.balanceDate)}
            {loan.initialAmountCents != null && (
              <span className="ml-1">· von {formatMoney(loan.initialAmountCents)}</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Zinssatz</p>
          <p className="text-lg font-bold tabular-nums">{fmt(loan.interestRateBps)}</p>
          {loan.interestFixedUntil ? (
            <p className={`text-xs mt-0.5 flex items-center gap-1 ${fixedStatus === "expired" ? "text-destructive" : fixedStatus === "soon" ? "text-amber-500" : "text-muted-foreground"}`}>
              {fixedStatus !== "ok" && <AlertTriangle className="size-3 shrink-0" />}
              bis {formatDate(loan.interestFixedUntil)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">p.a.</p>
          )}
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Rate</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(loan.monthlyPaymentCents)}</p>
          {laufzeitSeit && (
            <p className="text-xs text-muted-foreground mt-0.5">seit {laufzeitSeit}</p>
          )}
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">
            Zinsen {currentYear}
            {interestYTDIsEstimate && <span className="ml-1 text-amber-500">(Schätzung)</span>}
          </p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(interestYTD)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {interestYTDIsEstimate ? "Tilgungsplan generieren für exakte Werte" : "Werbungskosten"}
          </p>
        </div>
      </div>

      {/* Laufzeitinfo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Voraussichtliches Laufzeitende</p>
          <p className="text-base font-semibold">{payoffDate ?? "Nicht berechenbar"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">bei konstanter Rate und aktuellem Zinssatz</p>
        </div>
        {loan.interestFixedUntil && (
          <div className={`rounded-xl border px-4 py-3 ${fixedStatus === "expired" ? "border-destructive/50 bg-destructive/5" : fixedStatus === "soon" ? "border-amber-500/50 bg-amber-500/5" : "bg-card"}`}>
            <p className="text-xs text-muted-foreground mb-1">Zinsbindungsende</p>
            <p className={`text-base font-semibold flex items-center gap-1.5 ${fixedStatus === "expired" ? "text-destructive" : fixedStatus === "soon" ? "text-amber-500" : ""}`}>
              {fixedStatus !== "ok" && <AlertTriangle className="size-4 shrink-0" />}
              {formatDate(loan.interestFixedUntil)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fixedStatus === "expired"
                ? "Zinsbindung abgelaufen – Anschlussfinanzierung prüfen!"
                : fixedStatus === "soon"
                ? "Zinsbindung läuft innerhalb eines Jahres aus"
                : "Zinsbindung noch aktiv"}
            </p>
          </div>
        )}
      </div>

      {/* Tilgungsplan */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div>
            <h2 className="text-base font-semibold">Tilgungsplan</h2>
            {loan.loanPayments.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {paidCount} von {loan.loanPayments.length} Raten bezahlt
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasUnpaidFuture && (
              <form action={resetFuture}>
                <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  <RotateCcw className="size-4" />
                  Zukünftige zurücksetzen
                </Button>
              </form>
            )}
            <form action={generate}>
              <Button type="submit" variant="outline" size="sm">
                <CalendarPlus className="size-4" />
                12 Monate
              </Button>
            </form>
            <form action={generateFull}>
              <Button type="submit" variant="outline" size="sm">
                <Calendar className="size-4" />
                Vollständig
              </Button>
            </form>
          </div>
        </div>

        {loan.loanPayments.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            Noch keine Raten generiert.
          </div>
        ) : (
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="text-left px-4 py-3 font-medium">Monat</th>
                  <th className="text-right px-4 py-3 font-medium">Rate</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Zinsen</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Tilgung</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Restschuld danach</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loan.loanPayments.map((p) => {
                  const isPaid = !!p.paidAt;
                  const isOverdue = !isPaid && p.dueDate < today;
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">{formatMonth(p.dueDate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatMoney(p.totalCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                        {formatMoney(p.interestCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                        {formatMoney(p.principalCents)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                        {formatMoney(p.balanceAfterCents)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {isPaid ? (
                          <Badge variant="success">Bezahlt {formatDate(p.paidAt)}</Badge>
                        ) : isOverdue ? (
                          <Badge variant="destructive">Überfällig</Badge>
                        ) : (
                          <Badge variant="secondary">Offen</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isPaid && (
                          <form action={markPaid}>
                            <input type="hidden" name="paymentId" value={p.id} />
                            <Button type="submit" size="sm" variant="outline"
                              className="h-7 text-xs gap-1 text-green-500 border-green-500/30 hover:bg-green-500/10 hover:text-green-500">
                              <CheckCircle2 className="size-3" />
                              Bezahlt
                            </Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loan.notes && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {loan.notes}
        </div>
      )}
    </div>
  );
}
