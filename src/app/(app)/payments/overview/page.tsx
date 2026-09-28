import Link from "next/link";
import { SectionTabs } from "@/components/section-tabs";
import { getPaymentMatrixAction } from "@/server/actions/payments";
import { Button } from "@/components/ui/button";
import { Private } from "@/components/private";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { MatrixCell, MatrixCellStatus } from "@/lib/payment-matrix";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = { title: "Zahlungs-Jahresübersicht – Domora" };

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const STATUS: Record<MatrixCellStatus, { cls: string; label: string }> = {
  paid:     { cls: "bg-green-500/80 hover:bg-green-500", label: "Bezahlt" },
  partial:  { cls: "bg-amber-400/90 hover:bg-amber-400", label: "Teilweise bezahlt" },
  overdue:  { cls: "bg-red-500/85 hover:bg-red-500", label: "Überfällig" },
  open:     { cls: "border-2 border-dashed border-muted-foreground/40 hover:bg-muted", label: "Noch nicht fällig" },
  missing:  { cls: "border-2 border-dashed border-red-500/60 hover:bg-red-500/10", label: "Keine Soll-Stellung" },
  inactive: { cls: "bg-muted/40", label: "Kein Vertrag" },
};

function cellTitle(c: MatrixCell, year: number) {
  const m = `${MONTHS[c.month - 1]} ${year}`;
  if (c.status === "inactive" || c.status === "missing") return `${m}: ${STATUS[c.status].label}`;
  return `${m}: ${STATUS[c.status].label} – ${formatMoney(c.paidCents)} von ${formatMoney(c.sollCents)}`;
}

function Cell({ cell, year }: { cell: MatrixCell; year: number }) {
  const box = <span className={`block size-7 rounded-md transition-colors ${STATUS[cell.status].cls}`} />;
  return (
    <td className="px-0.5 py-1 text-center">
      {cell.paymentId ? (
        <Link href={`/payments/${cell.paymentId}/edit?back=${encodeURIComponent(`/payments/overview?year=${year}`)}`} title={cellTitle(cell, year)} aria-label={cellTitle(cell, year)} className="inline-block">
          {box}
        </Link>
      ) : cell.status === "missing" ? (
        <Link
          href={`/payments?month=${year}-${String(cell.month).padStart(2, "0")}`}
          title={`${cellTitle(cell, year)} – zum Monat`}
          aria-label={cellTitle(cell, year)}
          className="inline-block"
        >
          {box}
        </Link>
      ) : (
        <span title={cellTitle(cell, year)} className="inline-block">{box}</span>
      )}
    </td>
  );
}

export default async function PaymentOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearStr } = await searchParams;
  const currentYear = new Date().getFullYear();
  const parsed = yearStr ? parseInt(yearStr, 10) : NaN;
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= currentYear + 1 ? parsed : currentYear;

  const { rows } = await getPaymentMatrixAction(year);

  // Nach Objekt gruppieren
  const groups = new Map<string, { label: string; rows: typeof rows }>();
  for (const r of rows) {
    const g = groups.get(r.propertyId) ?? { label: r.propertyLabel, rows: [] };
    g.rows.push(r);
    groups.set(r.propertyId, g);
  }

  const total = rows.reduce(
    (s, r) => ({ soll: s.soll + r.sollCents, paid: s.paid + r.paidCents, rueck: s.rueck + r.rueckstandCents }),
    { soll: 0, paid: 0, rueck: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Zahlungen</h1>
        <p className="text-sm text-muted-foreground">
          Je Mietvertrag und Monat: Soll-Miete (Kalt + NK) gegen die Zahlungseingänge. Ein Feld öffnet die Zahlung.
        </p>
      </div>

      <SectionTabs tabs={[
        { href: "/payments", label: "Monat", active: false },
        { href: `/payments/overview?year=${year}`, label: "Jahresübersicht", active: true },
      ]} />

      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" aria-label="Vorjahr">
          <Link href={`/payments/overview?year=${year - 1}`}><ChevronLeft className="size-4" /></Link>
        </Button>
        <span className="min-w-14 text-center font-semibold tabular-nums">{year}</span>
        {year < currentYear + 1 && (
          <Button asChild variant="ghost" size="sm" aria-label="Folgejahr">
            <Link href={`/payments/overview?year=${year + 1}`}><ChevronRight className="size-4" /></Link>
          </Button>
        )}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {(["paid", "partial", "overdue", "open", "missing", "inactive"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-3.5 rounded ${STATUS[s].cls}`} />
            {STATUS[s].label}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          Keine Mietverträge in {year}.
        </div>
      ) : (
        <>
          {[...groups.values()].map((g) => (
            <section key={g.label} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{g.label}</h2>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">Mietvertrag</th>
                      {MONTHS.map((m) => (
                        <th key={m} className="px-0.5 py-2 text-center font-medium">{m}</th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Soll fällig</th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Rückstand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.leaseId} className="border-b last:border-0">
                        <td className="sticky left-0 z-10 bg-card px-3 py-2 align-middle">
                          <Link href={`/leases/${r.leaseId}`} className="block max-w-40 hover:underline sm:max-w-56">
                            <span className="block truncate font-medium"><Private>{r.tenantNames}</Private></span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.unitName}
                              {r.endDate && r.endDate <= `${year}-12-31` ? ` · bis ${formatDate(r.endDate)}` : ""}
                              {r.startDate >= `${year}-01-01` ? ` · ab ${formatDate(r.startDate)}` : ""}
                            </span>
                          </Link>
                        </td>
                        {r.cells.map((c) => <Cell key={c.month} cell={c} year={year} />)}
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          <Private>{formatMoney(r.sollCents)}</Private>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold ${r.rueckstandCents > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          <Private>{r.rueckstandCents > 0 ? formatMoney(r.rueckstandCents) : "–"}</Private>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Soll fällig {year}</p>
              <p className="text-lg font-bold tabular-nums"><Private>{formatMoney(total.soll)}</Private></p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Darauf gezahlt</p>
              <p className="text-lg font-bold tabular-nums text-green-600"><Private>{formatMoney(total.paid)}</Private></p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Rückstand {year}</p>
              <p className={`text-lg font-bold tabular-nums ${total.rueck > 0 ? "text-destructive" : ""}`}>
                <Private>{formatMoney(total.rueck)}</Private>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
