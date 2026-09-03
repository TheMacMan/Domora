"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatMonthShort } from "@/lib/dates";
import type { CashflowMonth } from "@/server/actions/cashflow";

type ChartRow = {
  ym: string;
  einnahmenIst: number;
  einnahmenSoll: number;
  ausgabenIst: number;
  ausgabenProg: number;
  darlehenIst: number;
  darlehenSoll: number;
  netto: number;
  isFuture: boolean;
};

export type CashflowMode = "full" | "simple";

function toChartRows(months: CashflowMonth[], mode: CashflowMode = "full"): ChartRow[] {
  return months.map((m) => {
    const actual = mode === "simple" ? m.income.actualColdCents : m.income.actualCents;
    const expected = mode === "simple" ? m.income.expectedColdCents : m.income.expectedCents;

    const einnahmenIst = Math.round(actual / 100);
    const einnahmenSoll = Math.round((expected - actual) / 100);

    // Im "simple"-Mode keine sonstigen Auszahlungen außer Darlehen
    const ausgabenIst = mode === "simple" ? 0 : -Math.round(m.expenses.actualCents / 100);
    const ausgabenProg = mode === "simple" ? 0 : -Math.round(m.expenses.projectedRecurringCents / 100);

    const darlehenIst = -Math.round(m.loans.actualCents / 100);
    const darlehenSoll = -Math.round(Math.max(0, m.loans.expectedCents - m.loans.actualCents) / 100);

    const expenses = mode === "simple" ? 0 : m.expenses.actualCents + m.expenses.projectedRecurringCents;
    const totalExpected = expected - expenses - m.loans.expectedCents;
    const netto = Math.round(totalExpected / 100);

    return { ym: m.ym, einnahmenIst, einnahmenSoll, ausgabenIst, ausgabenProg, darlehenIst, darlehenSoll, netto, isFuture: m.isFuture };
  });
}

const tooltipFormatter = (v: unknown): string => {
  const n = typeof v === "number" ? v : 0;
  return `${Math.abs(n).toLocaleString("de-DE")} €`;
};

export function CashflowChart({ months, mode = "full" }: { months: CashflowMonth[]; mode?: CashflowMode }) {
  const data = toChartRows(months, mode);
  const todayYM = new Date().toISOString().slice(0, 7);
  const isSimple = mode === "simple";

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} stackOffset="sign" margin={{ top: 16, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="ym" tickFormatter={formatMonthShort} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={50} />
        <Tooltip
          formatter={tooltipFormatter}
          labelFormatter={(label) => formatMonthShort(String(label))}
          contentStyle={{ borderRadius: "0.5rem", fontSize: "12px" }}
        />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <ReferenceLine x={todayYM} stroke="#1E6E76" strokeDasharray="3 3" />
        <Bar dataKey="einnahmenIst" name={isSimple ? "Kaltmiete (erhalten)" : "Einzahlungen (erhalten)"} stackId="a" fill="#10b981" />
        <Bar dataKey="einnahmenSoll" name={isSimple ? "Kaltmiete (erwartet)" : "Einzahlungen (erwartet)"} stackId="a" fill="#10b981" fillOpacity={0.35} />
        {!isSimple && <Bar dataKey="ausgabenIst" name="Auszahlungen (gezahlt)" stackId="a" fill="#ef4444" />}
        {!isSimple && <Bar dataKey="ausgabenProg" name="Auszahlungen (Prognose)" stackId="a" fill="#ef4444" fillOpacity={0.35} />}
        <Bar dataKey="darlehenIst" name="Darlehensrate (gezahlt)" stackId="a" fill="#f59e0b" />
        <Bar dataKey="darlehenSoll" name="Darlehensrate (offen)" stackId="a" fill="#f59e0b" fillOpacity={0.35} />
        <Line dataKey="netto" name="Netto-Cashflow (Prognose)" stroke="#1E6E76" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Vereinfachte Version für Objekt-Karten
export function CashflowMiniChart({ months, mode = "full" }: { months: CashflowMonth[]; mode?: CashflowMode }) {
  const data = toChartRows(months, mode);
  const isSimple = mode === "simple";
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} stackOffset="sign" margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey="ym" tickFormatter={formatMonthShort} tick={{ fontSize: 10 }} interval={1} />
        <YAxis hide />
        <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => formatMonthShort(String(label))} contentStyle={{ borderRadius: "0.5rem", fontSize: "11px" }} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Bar dataKey="einnahmenIst" stackId="a" fill="#10b981" />
        <Bar dataKey="einnahmenSoll" stackId="a" fill="#10b981" fillOpacity={0.35} />
        {!isSimple && <Bar dataKey="ausgabenIst" stackId="a" fill="#ef4444" />}
        {!isSimple && <Bar dataKey="ausgabenProg" stackId="a" fill="#ef4444" fillOpacity={0.35} />}
        <Bar dataKey="darlehenIst" stackId="a" fill="#f59e0b" />
        <Bar dataKey="darlehenSoll" stackId="a" fill="#f59e0b" fillOpacity={0.35} />
        <Line dataKey="netto" stroke="#1E6E76" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
