import Link from "next/link";
import { db } from "@/db";
import { leases, payments, units } from "@/db/schema";
import { and, isNull, gte, lte, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { currentYearMonth, formatMonthLong as formatMonthLabel, todayLocal } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Private } from "@/components/private";
import { ArrowRight, CreditCard, AlertTriangle, Home, FileText, TrendingUp } from "lucide-react";

export const metadata = { title: "Dashboard – Domora" };

function formatTenants(leaseTenants: Array<{ tenant: { firstName: string; lastName: string } }>) {
  return leaseTenants.map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`).join(" · ");
}

function fmtVpi(v: number) {
  return v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Find best-matching VPI: exact month, or latest available before that month
function findVpi(allVpi: Array<{ yearMonth: string; value: number }>, targetYM: string) {
  const candidates = allVpi.filter((v) => v.yearMonth <= targetYM);
  if (candidates.length === 0) return null;
  // allVpi is sorted desc, candidates first element is the closest ≤ target
  return candidates[0]!;
}

export default async function DashboardPage() {
  await requireUser();

  const today = todayLocal();
  const ym = currentYearMonth();
  const monthStart = `${ym}-01`;

  const [activeLeases, monthPayments, allUnits, openPayments, allVpi] = await Promise.all([
    db.query.leases.findMany({
      where: and(
        isNull(leases.deletedAt),
        lte(leases.startDate, today),
        or(isNull(leases.endDate), gte(leases.endDate, today))
      ),
      with: {
        unit: { with: { property: true } },
        leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
        rentAdjustments: {
          where: (r, { isNull }) => isNull(r.deletedAt),
          orderBy: (r, { desc }) => [desc(r.effectiveDate)],
        },
      },
    }),
    db.query.payments.findMany({
      where: and(isNull(payments.deletedAt), lte(payments.dueDate, monthStart), gte(payments.dueDate, monthStart)),
      with: {
        lease: {
          with: {
            unit: { with: { property: true } },
            leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
          },
        },
      },
    }),
    db.query.units.findMany({ where: isNull(units.deletedAt) }),
    db.query.payments.findMany({
      where: and(isNull(payments.deletedAt), isNull(payments.paidAt)),
      with: {
        lease: {
          with: {
            unit: { with: { property: true } },
            leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
          },
        },
      },
    }).then((rows) => rows.filter((r) => r.dueDate < today)),
    db.query.vpiEntries.findMany({
      orderBy: (v, { desc }) => [desc(v.yearMonth)],
    }),
  ]);

  const monthSoll = monthPayments.reduce((s, p) => s + p.rentCents + (p.serviceChargesCents ?? 0), 0);
  const monthPaid = monthPayments.reduce((s, p) => s + (p.paidCents ?? 0), 0);
  const openTotal = openPayments.reduce((s, p) => s + p.rentCents + (p.serviceChargesCents ?? 0), 0);

  // VPI-Monitoring für Indexmieten
  const indexLeases = activeLeases.filter((l) => l.rentType === "index");
  const latestVpi = allVpi[0] ?? null; // sorted desc → first is newest

  type IndexRow = {
    id: string;
    label: string;
    unit: string;
    currentRentCents: number;
    refYM: string;
    refReason: "Vertragsstart" | "Letzte Anpassung";
    refVpi: { yearMonth: string; value: number } | null;
    latestVpi: { yearMonth: string; value: number } | null;
    deltaPct: number | null;
    potentialRentCents: number | null;
  };

  const indexRows: IndexRow[] = indexLeases.map((l) => {
    // Reference: last paid adjustment that is ≤ today, or lease start
    const lastAdj = l.rentAdjustments.find((a) => a.effectiveDate <= today);
    const refDate = lastAdj?.effectiveDate ?? l.startDate;
    const refYM = refDate.slice(0, 7); // YYYY-MM
    const refReason: "Vertragsstart" | "Letzte Anpassung" = lastAdj ? "Letzte Anpassung" : "Vertragsstart";

    const currentRentCents = lastAdj?.rentCents ?? l.rentCents;

    const refVpi = findVpi(allVpi, refYM);
    const curVpi = latestVpi;

    let deltaPct: number | null = null;
    let potentialRentCents: number | null = null;
    if (refVpi && curVpi && refVpi.yearMonth !== curVpi.yearMonth) {
      deltaPct = ((curVpi.value - refVpi.value) / refVpi.value) * 100;
      potentialRentCents = Math.round((currentRentCents * curVpi.value) / refVpi.value);
    }

    return {
      id: l.id,
      label: formatTenants(l.leaseTenants),
      unit: `${l.unit.name} · ${l.unit.property.street}`,
      currentRentCents,
      refYM,
      refReason,
      refVpi,
      latestVpi: curVpi,
      deltaPct,
      potentialRentCents,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">{formatMonthLabel(ym)}</p>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Aktive Verträge",
            value: activeLeases.length,
            sub: `von ${allUnits.length} Einheiten`,
            icon: <FileText className="size-4" />,
            href: "/leases",
          },
          {
            label: "Soll " + formatMonthLabel(ym),
            value: formatMoney(monthSoll),
            sub: `${monthPayments.length} Zahlung${monthPayments.length !== 1 ? "en" : ""}`,
            icon: <CreditCard className="size-4" />,
            href: "/payments",
          },
          {
            label: "Eingegangen",
            value: formatMoney(monthPaid),
            sub: monthSoll > 0 ? `${Math.round((monthPaid / monthSoll) * 100)} % des Solls` : "–",
            icon: <CreditCard className="size-4" />,
            href: "/payments",
            highlight: true,
          },
          {
            label: "Offene Posten",
            value: openPayments.length > 0 ? formatMoney(openTotal) : "–",
            sub: openPayments.length > 0 ? `${openPayments.length} überfällig` : "Alles bezahlt",
            icon: <AlertTriangle className="size-4" />,
            href: "/payments",
            danger: openPayments.length > 0,
          },
        ].map(({ label, value, sub, icon, href, highlight, danger }) => (
          <Link key={label} href={href} className="rounded-xl border bg-card px-5 py-4 hover:bg-accent/30 transition-colors">
            <div className={`mb-3 ${danger ? "text-destructive" : highlight ? "text-green-500" : "text-muted-foreground"}`}>
              {icon}
            </div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-xl font-bold tabular-nums ${danger ? "text-destructive" : highlight ? "text-green-500" : ""}`}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </Link>
        ))}
      </div>

      {/* VPI-Monitoring für Indexmieten */}
      {indexLeases.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Indexmieten – VPI-Entwicklung</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/cpi">VPI pflegen <ArrowRight className="size-3 ml-1" /></Link>
            </Button>
          </div>

          {allVpi.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              Noch keine VPI-Daten hinterlegt.{" "}
              <Link href="/cpi" className="underline hover:no-underline font-medium">
                VPI-Werte erfassen
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-medium">Einheit / Mieter</th>
                    <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Referenz-VPI</th>
                    <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Aktuell VPI</th>
                    <th className="text-right px-4 py-3 font-medium">Änderung</th>
                    <th className="text-right px-4 py-3 font-medium">Mögliche Miete</th>
                  </tr>
                </thead>
                <tbody>
                  {indexRows.map((row) => {
                    const pos = (row.deltaPct ?? 0) >= 0;
                    return (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            <Link href={`/leases/${row.id}`} className="hover:underline">
                              <Private>{row.label}</Private>
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground">{row.unit}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Basis: {row.refVpi
                              ? `${formatMonthLabel(row.refVpi.yearMonth)} (${row.refReason})`
                              : `${formatMonthLabel(row.refYM)} – kein VPI hinterlegt`}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono hidden sm:table-cell text-muted-foreground">
                          {row.refVpi ? fmtVpi(row.refVpi.value) : <span className="text-xs">–</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono hidden sm:table-cell text-muted-foreground">
                          {row.latestVpi
                            ? <><span>{fmtVpi(row.latestVpi.value)}</span><span className="text-[10px] ml-1 text-muted-foreground/60">{row.latestVpi.yearMonth}</span></>
                            : <span className="text-xs">–</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.deltaPct != null ? (
                            <span className={`text-sm font-semibold tabular-nums ${pos ? "text-green-600" : "text-destructive"}`}>
                              {pos ? "+" : ""}{row.deltaPct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.potentialRentCents != null && row.potentialRentCents !== row.currentRentCents ? (
                            <div>
                              <div className="font-semibold text-sm tabular-nums">
                                {formatMoney(row.potentialRentCents)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                bisher {formatMoney(row.currentRentCents)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
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
      )}

      {/* Offene Posten */}
      {openPayments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold">Offene Posten</h2>
            <Badge variant="destructive">{openPayments.length}</Badge>
          </div>
          <div className="rounded-xl border border-destructive/30 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {openPayments.slice(0, 5).map((p) => {
                  const parts = p.dueDate.split("-");
                  const y = parseInt(parts[0] ?? "2026", 10);
                  const m = parseInt(parts[1] ?? "1", 10);
                  const label = new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "short", year: "numeric" });
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Private>{formatTenants(p.lease.leaseTenants)}</Private>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {p.lease.unit.name} · {p.lease.unit.property.street}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{label}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-destructive font-medium">
                        {formatMoney(p.rentCents + (p.serviceChargesCents ?? 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {openPayments.length > 5 && (
            <div className="mt-2 text-right">
              <Button asChild variant="ghost" size="sm">
                <Link href="/payments">Alle {openPayments.length} anzeigen <ArrowRight className="size-3 ml-1" /></Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Aktive Verträge */}
      {activeLeases.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Aktive Mietverträge</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/leases">Alle <ArrowRight className="size-3 ml-1" /></Link>
            </Button>
          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {activeLeases.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium"><Private>{formatTenants(l.leaseTenants)}</Private></div>
                      <div className="text-xs text-muted-foreground">{l.unit.name} · {l.unit.property.street}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="font-medium">{formatMoney(l.rentCents)}</div>
                      {l.serviceChargesCents != null && (
                        <div className="text-xs text-muted-foreground">+ {formatMoney(l.serviceChargesCents)} NK</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeLeases.length === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Home className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Noch keine aktiven Mietverträge.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/leases/new">Ersten Vertrag anlegen</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
