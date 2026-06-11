"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { formatMonthShort } from "@/lib/dates";
import type { LoanForProjection, YearlyRow } from "@/lib/loan-projection";

type BalanceRow = Record<string, number | string>;

const TooltipEur = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {Math.round(p.value / 100).toLocaleString("de-DE")} €
        </p>
      ))}
    </div>
  );
};

const TooltipYearly = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; payload: YearlyRow }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
      <p className="font-medium mb-1">
        {label}
        {row?.isPartial && <span className="ml-1 text-amber-500 font-normal">(Rumpfjahr, {row.actualMonths}/{row.expectedMonths} Mon.)</span>}
      </p>
      {payload.filter((p) => p.value > 0).map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {(p.value).toLocaleString("de-DE")} €
        </p>
      ))}
    </div>
  );
};

export function BalanceChart({ data, filtered, colorById }: {
  data: BalanceRow[];
  filtered: LoanForProjection[];
  colorById: Map<string, string>;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-1">Restschuldentwicklung</h2>
      <p className="text-xs text-muted-foreground mb-4">
        {filtered.some((l) => l.loanPayments.length === 0) ? "Projektion – vollständigen Tilgungsplan generieren für exakte Werte" : "Basiert auf generiertem Tilgungsplan"}
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v: number) => `${Math.round(v / 100).toLocaleString("de-DE")} €`} tick={{ fontSize: 11 }} width={80} />
          <Tooltip content={<TooltipEur />} />
          <Legend />
          {filtered.length > 1 && (
            <Line dataKey="gesamt" name="Gesamt" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          )}
          {filtered.some((l) => l.loanType === "bauspar") && (
            <Line dataKey="netto" name="Netto (abzgl. Bauspar-Guthaben)" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="2 2" dot={false} />
          )}
          {filtered.map((l) => (
            <Line key={l.id} dataKey={l.id} name={l.description} stroke={colorById.get(l.id)} strokeWidth={2} dot={false} />
          ))}
          <ReferenceLine x={new Date().toISOString().slice(0, 7)} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Heute", fontSize: 10, fill: "#f59e0b" }} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

export function YearlyInterestChart({ data, currentYear }: { data: YearlyRow[]; currentYear: number }) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-1">Jährliche Zinslast (Werbungskosten)</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Alle Darlehen kombiniert – relevant für Anlage V.{" "}
        {data.some((y) => y.isPartial) && (
          <span className="text-amber-500">Rumpfjahre sind schraffiert auf das volle Jahr hochgerechnet.</span>
        )}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <defs>
            <pattern id="stripeZinsen" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#f59e0b" fillOpacity="0.25" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="2" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => `${v.toLocaleString("de-DE")} €`} tick={{ fontSize: 11 }} width={80} />
          <Tooltip content={<TooltipYearly />} />
          <ReferenceLine x={String(currentYear)} stroke="#1E6E76" strokeDasharray="3 3" />
          <Bar dataKey="zinsen" name="Zinsen (tatsächlich)" stackId="z" fill="#f59e0b" />
          <Bar dataKey="zinsenHochrechnung" name="Zinsen (Hochrechnung)" stackId="z" fill="url(#stripeZinsen)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

export function InterestVsPrincipalChart({ data, currentYear }: { data: YearlyRow[]; currentYear: number }) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-1">Zins vs. Tilgung pro Jahr</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Gestapelt – wie viel der Rate fließt in Zinsen, wie viel in Tilgung.{" "}
        {data.some((y) => y.isPartial) && (
          <span className="text-amber-500">Rumpfjahre sind schraffiert auf das volle Jahr hochgerechnet.</span>
        )}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <defs>
            <pattern id="stripeZinsen2" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#f59e0b" fillOpacity="0.25" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="2" />
            </pattern>
            <pattern id="stripeTilgung2" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#10b981" fillOpacity="0.25" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#10b981" strokeWidth="2" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => `${v.toLocaleString("de-DE")} €`} tick={{ fontSize: 11 }} width={80} />
          <Tooltip content={<TooltipYearly />} />
          <Legend />
          <ReferenceLine x={String(currentYear)} stroke="#1E6E76" strokeDasharray="3 3" />
          <Bar dataKey="zinsen" name="Zinsen" stackId="a" fill="#f59e0b" />
          <Bar dataKey="zinsenHochrechnung" name="Zinsen (Hochrechnung)" stackId="a" fill="url(#stripeZinsen2)" />
          <Bar dataKey="tilgung" name="Tilgung" stackId="a" fill="#10b981" />
          <Bar dataKey="tilgungHochrechnung" name="Tilgung (Hochrechnung)" stackId="a" fill="url(#stripeTilgung2)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
