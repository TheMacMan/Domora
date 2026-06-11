import Link from "next/link";
import { getCashflowAction, type CashflowMonth } from "@/server/actions/cashflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatMonthShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { CashflowChart, CashflowMiniChart, type CashflowMode } from "@/components/cashflow/cashflow-chart";
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Landmark, Building2 } from "lucide-react";

export const metadata = { title: "Cashflow – Domora" };

function sumIncome(months: CashflowMonth[], mode: CashflowMode) {
  return months.reduce((s, m) => {
    const actual = mode === "simple" ? m.income.actualColdCents : m.income.actualCents;
    const expected = mode === "simple" ? m.income.expectedColdCents : m.income.expectedCents;
    return s + Math.max(actual, expected);
  }, 0);
}
function sumIncomeActual(months: CashflowMonth[], mode: CashflowMode) {
  return months.reduce((s, m) => s + (mode === "simple" ? m.income.actualColdCents : m.income.actualCents), 0);
}
function sumExpenses(months: CashflowMonth[]) {
  return months.reduce((s, m) => s + m.expenses.actualCents + m.expenses.projectedRecurringCents, 0);
}
function sumLoans(months: CashflowMonth[]) {
  return months.reduce((s, m) => s + Math.max(m.loans.actualCents, m.loans.expectedCents), 0);
}
function sumNetExpected(months: CashflowMonth[], mode: CashflowMode) {
  return months.reduce((s, m) => {
    const inc = mode === "simple" ? m.income.expectedColdCents : m.income.expectedCents;
    const exp = mode === "simple" ? 0 : m.expenses.actualCents + m.expenses.projectedRecurringCents;
    const loans = m.loans.expectedCents;
    return s + inc - exp - loans;
  }, 0);
}

function MonthlyTable({ months, mode }: { months: CashflowMonth[]; mode: CashflowMode }) {
  const isSimple = mode === "simple";
  return (
    <div className="rounded-xl border overflow-x-auto bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b">
            <th className="text-left px-4 py-3 font-medium">Monat</th>
            <th className="text-right px-4 py-3 font-medium">{isSimple ? "Kaltmiete" : "Einzahlungen"}</th>
            {!isSimple && <th className="text-right px-4 py-3 font-medium">Auszahlungen</th>}
            <th className="text-right px-4 py-3 font-medium">Darlehen</th>
            <th className="text-right px-4 py-3 font-medium">Netto-Cashflow</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const incomeActual = isSimple ? m.income.actualColdCents : m.income.actualCents;
            const incomeExpected = isSimple ? m.income.expectedColdCents : m.income.expectedCents;
            const income = Math.max(incomeActual, incomeExpected);
            const expenses = isSimple ? 0 : m.expenses.actualCents + m.expenses.projectedRecurringCents;
            const loanAmt = Math.max(m.loans.actualCents, m.loans.expectedCents);
            const net = incomeExpected - expenses - m.loans.expectedCents;
            const incomeIncomplete = incomeActual < incomeExpected && !m.isFuture;
            return (
              <tr key={m.ym} className={`border-b last:border-0 ${m.isCurrent ? "bg-primary/5" : ""}`}>
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  {formatMonthShort(m.ym)}
                  {m.isCurrent && <Badge variant="secondary" className="ml-2 text-[10px]">aktuell</Badge>}
                  {m.isFuture && <Badge variant="outline" className="ml-2 text-[10px]">Prognose</Badge>}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${incomeIncomplete ? "text-amber-500" : "text-green-600"}`} title={incomeIncomplete ? `Erhalten: ${formatMoney(incomeActual)} von ${formatMoney(incomeExpected)}` : undefined}>
                  {income > 0 ? formatMoney(income) : "–"}
                </td>
                {!isSimple && (
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">
                    {expenses > 0 ? `−${formatMoney(expenses)}` : "–"}
                  </td>
                )}
                <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                  {loanAmt > 0 ? `−${formatMoney(loanAmt)}` : "–"}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${net >= 0 ? "text-foreground" : "text-destructive"}`}>
                  {formatMoney(net)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ year?: string; view?: string }> }) {
  const sp = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = sp.year ? parseInt(sp.year, 10) : currentYear;
  const mode: CashflowMode = sp.view === "simple" ? "simple" : "full";
  const isSimple = mode === "simple";

  const data = await getCashflowAction(year);

  const totalIncome = sumIncome(data.total, mode);
  const totalIncomeActual = sumIncomeActual(data.total, mode);
  const totalExpenses = sumExpenses(data.total);
  const totalLoans = sumLoans(data.total);
  const totalNet = sumNetExpected(data.total, mode);
  const incomePct = totalIncome > 0 ? Math.round((totalIncomeActual / totalIncome) * 100) : 0;

  const baseQuery = year !== currentYear ? `&year=${year}` : "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cashflow</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSimple
              ? "Vereinfacht: nur Kaltmiete gegen Darlehensraten · Werbungskosten und NK ausgeblendet"
              : "Einzahlungen (Kaltmiete + NK) gegen Auszahlungen (Werbungskosten und Darlehen) · IST bis heute, Prognose ab nächstem Monat"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" title={`Jahr ${year - 1}`}>
            <Link href={`/cashflow?view=${mode}&year=${year - 1}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <span className="font-semibold text-lg w-16 text-center tabular-nums">{year}</span>
          <Button asChild variant="ghost" size="icon" title={`Jahr ${year + 1}`}>
            <Link href={`/cashflow?view=${mode}&year=${year + 1}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          {year !== currentYear && (
            <Button asChild variant="outline" size="sm" className="ml-2">
              <Link href={`/cashflow?view=${mode}`}>Heute</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Mode-Toggle */}
      <div className="inline-flex rounded-lg border bg-muted/50 p-1 gap-1 w-fit">
        <Link
          href={`/cashflow${baseQuery ? `?${baseQuery.slice(1)}` : ""}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            !isSimple ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Vollständig
        </Link>
        <Link
          href={`/cashflow?view=simple${baseQuery}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            isSimple ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Vereinfacht (nur Kalt vs. Darlehen)
        </Link>
      </div>

      {/* KPI-Karten */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isSimple ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-3 sm:gap-4`}>
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1 text-green-600">
            <ArrowUpRight className="size-4" />
            <p className="text-xs">{isSimple ? "Kaltmiete" : "Einzahlungen"}</p>
          </div>
          <p className="text-lg font-bold tabular-nums">{formatMoney(totalIncome)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {incomePct}% erhalten
          </p>
        </div>
        {!isSimple && (
          <div className="rounded-xl border bg-card px-4 py-3">
            <div className="flex items-center gap-2 mb-1 text-destructive">
              <ArrowDownRight className="size-4" />
              <p className="text-xs">Auszahlungen</p>
            </div>
            <p className="text-lg font-bold tabular-nums">−{formatMoney(totalExpenses)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Werbungskosten</p>
          </div>
        )}
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1 text-amber-600">
            <Landmark className="size-4" />
            <p className="text-xs">Darlehen</p>
          </div>
          <p className="text-lg font-bold tabular-nums">−{formatMoney(totalLoans)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Zins + Tilgung</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Netto-Cashflow {year}</p>
          <p className={`text-lg font-bold tabular-nums ${totalNet >= 0 ? "text-foreground" : "text-destructive"}`}>
            {formatMoney(totalNet)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            ⌀ {formatMoney(Math.round(totalNet / 12))} / Monat
          </p>
        </div>
      </div>

      {/* Chart Gesamt */}
      <section>
        <h2 className="text-base font-semibold mb-1">Gesamt-Cashflow</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {isSimple ? "Kaltmiete" : "Einzahlungen"} positiv · {isSimple ? "Darlehen" : "Auszahlungen und Darlehen"} negativ · blaue Linie = Netto-Cashflow
        </p>
        <div className="rounded-xl border bg-card p-4">
          <CashflowChart months={data.total} mode={mode} />
        </div>
      </section>

      {/* Monatstabelle */}
      <section>
        <h2 className="text-base font-semibold mb-3">Monatsübersicht</h2>
        <MonthlyTable months={data.total} mode={mode} />
      </section>

      {/* Pro Objekt */}
      {data.perProperty.length > 1 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Nach Objekt</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.perProperty.map((p) => {
              const pNet = sumNetExpected(p.months, mode);
              const pIncome = sumIncome(p.months, mode);
              const pExp = sumExpenses(p.months);
              const pLoans = sumLoans(p.months);
              return (
                <div key={p.propertyId} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{p.street}</h3>
                        <p className="text-xs text-muted-foreground">{p.city}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-base font-bold tabular-nums ${pNet >= 0 ? "" : "text-destructive"}`}>{formatMoney(pNet)}</p>
                      <p className="text-xs text-muted-foreground">Netto {year}</p>
                    </div>
                  </div>
                  <CashflowMiniChart months={p.months} mode={mode} />
                  <div className={`grid ${isSimple ? "grid-cols-2" : "grid-cols-3"} gap-2 mt-3 text-xs`}>
                    <div>
                      <p className="text-muted-foreground">{isSimple ? "Kaltmiete" : "Einzahlungen"}</p>
                      <p className="font-medium tabular-nums text-green-600">{formatMoney(pIncome)}</p>
                    </div>
                    {!isSimple && (
                      <div>
                        <p className="text-muted-foreground">Auszahlungen</p>
                        <p className="font-medium tabular-nums text-destructive">−{formatMoney(pExp)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground">Darlehen</p>
                      <p className="font-medium tabular-nums text-amber-600">−{formatMoney(pLoans)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
