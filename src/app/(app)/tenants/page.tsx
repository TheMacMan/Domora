import Link from "next/link";
import { getTenantOverviewAction } from "@/server/actions/tenants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Private } from "@/components/private";
import { SectionTabs } from "@/components/section-tabs";
import { formatMoney } from "@/lib/money";
import { formatDate, todayLocal } from "@/lib/dates";
import { tenancyDuration, type TenantStatus } from "@/lib/tenant-overview";
import { Plus, Pencil, Mail, Phone } from "lucide-react";

export const metadata = { title: "Mieter – Domora" };

type Row = Awaited<ReturnType<typeof getTenantOverviewAction>>[number];
type Filter = "active" | "former" | "all";

function StatusBadge({ row, today }: { row: Row; today: string }) {
  const l = row.lease;
  const map: Record<TenantStatus, React.ReactNode> = {
    active: (
      <Badge variant="success">
        aktiv{l?.endDate ? ` bis ${formatDate(l.endDate)}` : ""}
      </Badge>
    ),
    future: <Badge variant="warning">ab {l ? formatDate(l.startDate) : "–"}</Badge>,
    ended: <Badge variant="secondary">ausgezogen {l?.endDate ? formatDate(l.endDate) : ""}</Badge>,
    none: <Badge variant="secondary">kein Vertrag</Badge>,
  };
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {map[row.status]}
      {row.status === "active" && l && (
        <span className="text-xs text-muted-foreground">seit {formatDate(l.startDate)} · {tenancyDuration(l.startDate, today)}</span>
      )}
    </span>
  );
}

function Contact({ row }: { row: Row }) {
  if (!row.email && !row.phone) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {row.email && (
        <a href={`mailto:${row.email}`} title={row.email} aria-label={`E-Mail an ${row.firstName} ${row.lastName}`}
          className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground">
          <Mail className="size-4" />
        </a>
      )}
      {row.phone && (
        <a href={`tel:${row.phone.replace(/\s/g, "")}`} title={row.phone} aria-label={`${row.firstName} ${row.lastName} anrufen`}
          className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground">
          <Phone className="size-4" />
        </a>
      )}
    </span>
  );
}

function Rent({ row }: { row: Row }) {
  const l = row.lease;
  if (!l || row.status === "ended" || row.status === "none") return <span className="text-muted-foreground">–</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <Private className="font-medium tabular-nums">{formatMoney(l.rentCents + (l.serviceChargesCents ?? 0))}</Private>
      <span className="text-xs text-muted-foreground tabular-nums">
        <Private>{formatMoney(l.rentCents)} + {formatMoney(l.serviceChargesCents ?? 0)} NK</Private>
      </span>
    </span>
  );
}

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: f } = await searchParams;
  const filter: Filter = f === "former" || f === "all" ? f : "active";
  const today = todayLocal();
  const all = await getTenantOverviewAction();

  const isCurrent = (r: Row) => r.status === "active" || r.status === "future";
  const counts = { active: all.filter(isCurrent).length, former: all.filter((r) => !isCurrent(r)).length };
  const rows = filter === "all" ? all : all.filter((r) => (filter === "active" ? isCurrent(r) : !isCurrent(r)));
  // Aktive nach Objekt und Wohnung sortieren, damit Mitmieter zusammenstehen
  if (filter === "active") {
    rows.sort((a, b) =>
      (a.lease?.propertyLabel ?? "").localeCompare(b.lease?.propertyLabel ?? "", "de") ||
      (a.lease?.unitName ?? "").localeCompare(b.lease?.unitName ?? "", "de") ||
      a.lastName.localeCompare(b.lastName, "de"),
    );
  }
  const totalArrears = rows.reduce((s, r) => s + r.arrearsCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mieter</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {counts.active} aktiv · {counts.former} ehemalig
            {totalArrears > 0 && <> · Rückstand <Private className="font-medium text-destructive">{formatMoney(totalArrears)}</Private></>}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/tenants/new">
            <Plus className="size-4" />
            Neuer Mieter
          </Link>
        </Button>
      </div>

      <SectionTabs tabs={[
        { href: "/tenants", label: `Aktiv (${counts.active})`, active: filter === "active" },
        { href: "/tenants?filter=former", label: `Ehemalig (${counts.former})`, active: filter === "former" },
        { href: "/tenants?filter=all", label: `Alle (${all.length})`, active: filter === "all" },
      ]} />

      {rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {all.length === 0 ? (
            <>
              <p>Noch keine Mieter angelegt.</p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/tenants/new">Ersten Mieter anlegen</Link>
              </Button>
            </>
          ) : (
            <p>Keine Mieter in dieser Ansicht.</p>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: Karten */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/tenants/${r.id}`} className="min-w-0">
                    <p className="font-medium"><Private>{r.lastName}, {r.firstName}</Private></p>
                    {r.lease && (
                      <p className="text-xs text-muted-foreground truncate">
                        {r.lease.unitName} · {r.lease.propertyLabel}
                      </p>
                    )}
                  </Link>
                  <Contact row={r} />
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <StatusBadge row={r} today={today} />
                  <Rent row={r} />
                </div>
                {r.arrearsCents > 0 && (
                  <p className="mt-2 text-xs font-medium text-destructive">
                    Rückstand <Private>{formatMoney(r.arrearsCents)}</Private>
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: Tabelle */}
          <div className="hidden md:block rounded-xl border overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="text-left px-4 py-3 font-medium">Mieter</th>
                  <th className="text-left px-4 py-3 font-medium">Wohnung</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Miete / Monat</th>
                  <th className="text-right px-4 py-3 font-medium">Rückstand</th>
                  <th className="text-left px-4 py-3 font-medium">Kontakt</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/tenants/${r.id}`} className="hover:underline font-medium">
                        <Private>{r.lastName}, {r.firstName}</Private>
                      </Link>
                      {r.lease && r.lease.coTenants.length > 0 && (
                        <p className="text-xs text-muted-foreground">mit <Private>{r.lease.coTenants.join(", ")}</Private></p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {r.lease ? (
                        <Link href={`/leases/${r.lease.id}`} className="hover:underline">
                          <span className="block">{r.lease.unitName}</span>
                          <span className="block text-xs text-muted-foreground">{r.lease.propertyLabel}</span>
                        </Link>
                      ) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="px-4 py-3 align-top"><StatusBadge row={r} today={today} /></td>
                    <td className="px-4 py-3 align-top text-right"><Rent row={r} /></td>
                    <td className={`px-4 py-3 align-top text-right tabular-nums ${r.arrearsCents > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {r.arrearsCents > 0 ? <Private>{formatMoney(r.arrearsCents)}</Private> : "–"}
                    </td>
                    <td className="px-4 py-3 align-top"><Contact row={r} /></td>
                    <td className="px-4 py-3 align-top text-right">
                      <Button asChild variant="ghost" size="icon" aria-label="Mieter bearbeiten">
                        <Link href={`/tenants/${r.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
