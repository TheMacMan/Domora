import Link from "next/link";
import { getLeasesAction } from "@/server/actions/leases";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate, todayLocal } from "@/lib/dates";
import { Private } from "@/components/private";
import { Plus, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import type { BadgeVariant } from "@/components/ui/badge";
import { RENT_COMPONENT_LABELS, type RentComponentKind } from "@/lib/validators/lease";
import { LeaseFilters } from "@/components/leases/lease-filters";
import { effectiveRentAt } from "@/lib/rent";

export const metadata = { title: "Mietverträge – Domora" };

type Lease = Awaited<ReturnType<typeof getLeasesAction>>[number];
type LeaseStatusValue = "active" | "future" | "ended";

function leaseStatusValue(startDate: string, endDate: string | null, now: string): LeaseStatusValue {
  if (startDate > now) return "future";
  if (endDate && endDate < now) return "ended";
  return "active";
}

const STATUS_META: Record<LeaseStatusValue, { label: string; variant: BadgeVariant }> = {
  active:  { label: "Aktiv",      variant: "success"   },
  future:  { label: "Zukünftig",  variant: "warning"   },
  ended:   { label: "Beendet",    variant: "secondary" },
};

const rentTypeLabels: Record<string, string> = {
  fixed: "Fest",
  index: "Index",
  graduated: "Staffel",
};

function componentLabel(c: { kind: string; description: string | null }): string {
  const base = RENT_COMPONENT_LABELS[c.kind as RentComponentKind] ?? c.kind;
  return c.description?.trim() ? `${base} (${c.description.trim()})` : base;
}

// Aktuell wirksame Kaltmiete:
// − Aktive / zukünftige Verträge: zum heutigen Datum
// − Beendete Verträge: zum Ende der Mietzeit (letzte tatsächlich gültige Miete)
function currentRentCentsOf(lease: Lease, now: string): number {
  const asOf = lease.endDate && lease.endDate < now ? lease.endDate : now;
  return effectiveRentAt(lease, lease.rentAdjustments, asOf).rentCents;
}

// Sortiert Leases innerhalb eines Objekts: aktive zuerst, dann zukünftige, dann
// beendete; innerhalb der Gruppe nach Etage aufsteigend, dann Unit-Name.
function leaseOrder(a: Lease, b: Lease, now: string): number {
  const order: Record<LeaseStatusValue, number> = { active: 0, future: 1, ended: 2 };
  const sa = order[leaseStatusValue(a.startDate, a.endDate, now)];
  const sb = order[leaseStatusValue(b.startDate, b.endDate, now)];
  if (sa !== sb) return sa - sb;
  const fa = a.unit.floor ?? 999;
  const fb = b.unit.floor ?? 999;
  if (fa !== fb) return fa - fb;
  return a.unit.name.localeCompare(b.unit.name, "de");
}

function groupByProperty(leases: Lease[], now: string) {
  const groups = new Map<string, { property: Lease["unit"]["property"]; leases: Lease[] }>();
  for (const l of leases) {
    const key = l.unit.property.id;
    if (!groups.has(key)) groups.set(key, { property: l.unit.property, leases: [] });
    groups.get(key)!.leases.push(l);
  }
  const arr = [...groups.values()];
  arr.sort((a, b) => {
    const ca = a.property.city.localeCompare(b.property.city, "de");
    if (ca !== 0) return ca;
    return a.property.street.localeCompare(b.property.street, "de");
  });
  for (const g of arr) g.leases.sort((a, b) => leaseOrder(a, b, now));
  return arr;
}

function buildCollapseHref(
  params: Record<string, string | undefined>,
  toggleId: string,
  currentCollapsed: Set<string>,
): string {
  const next = new Set(currentCollapsed);
  if (next.has(toggleId)) next.delete(toggleId);
  else next.add(toggleId);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "collapsed" || v == null) continue;
    qs.set(k, v);
  }
  if (next.size > 0) qs.set("collapsed", [...next].join(","));
  const s = qs.toString();
  return s ? `/leases?${s}` : "/leases";
}

export default async function LeasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const statusFilter   = typeof sp.status   === "string" ? sp.status   : "default";
  const typeFilter     = typeof sp.type     === "string" ? sp.type     : "all";
  const collapsedSet = new Set(
    (typeof sp.collapsed === "string" ? sp.collapsed.split(",") : []).filter(Boolean),
  );

  const leaseList = await getLeasesAction();
  const now = todayLocal();

  // Filter anwenden. Status-Default = "default" = active + future (beendete aus).
  const filtered = leaseList.filter((l) => {
    if (propertyFilter !== "all" && l.unit.property.id !== propertyFilter) return false;
    const sv = leaseStatusValue(l.startDate, l.endDate, now);
    if (statusFilter === "default" && sv === "ended") return false;
    if (statusFilter === "active"   && sv !== "active") return false;
    if (statusFilter === "future"   && sv !== "future") return false;
    if (statusFilter === "ended"    && sv !== "ended")  return false;
    // "all" lässt alles durch
    if (typeFilter !== "all" && l.rentType !== typeFilter) return false;
    return true;
  });

  const groups = groupByProperty(filtered, now);

  // Property-Optionen für Filter — alphabetisch (Stadt/Straße)
  const propertyOptions = [...new Map(leaseList.map((l) => [l.unit.property.id, l.unit.property])).values()]
    .sort((a, b) => {
      const c = a.city.localeCompare(b.city, "de");
      return c !== 0 ? c : a.street.localeCompare(b.street, "de");
    })
    .map((p) => ({ id: p.id, label: `${p.street}, ${p.city}` }));

  // Header-Stats: aktive Verträge in der gefilterten Menge
  const totalCount = filtered.length;
  const activeCount = filtered.filter((l) => leaseStatusValue(l.startDate, l.endDate, now) === "active").length;
  const hasActiveFilter = propertyFilter !== "all" || statusFilter !== "default" || typeFilter !== "all";

  const showSectionHeaders = groups.length > 1;
  const currentParams: Record<string, string | undefined> = {
    property: propertyFilter !== "all" ? propertyFilter : undefined,
    status: statusFilter !== "default" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mietverträge</h1>
          {leaseList.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilter
                ? `${totalCount} Treffer · ${activeCount} aktiv`
                : `${activeCount} aktiv · ${totalCount} gesamt`}
            </p>
          )}
        </div>
        <Button asChild size="sm">
          <Link href="/leases/new">
            <Plus className="size-4" />
            Neuer Vertrag
          </Link>
        </Button>
      </div>

      {leaseList.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground rounded-xl border border-dashed">
          <p>Noch keine Mietverträge angelegt.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/leases/new">Ersten Vertrag anlegen</Link>
          </Button>
        </div>
      ) : (
        <>
          <LeaseFilters properties={propertyOptions} />

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground rounded-xl border border-dashed">
              Keine Verträge entsprechen den Filterkriterien.
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => {
                const collapsed = collapsedSet.has(g.property.id);
                const groupActive = g.leases.filter((l) => leaseStatusValue(l.startDate, l.endDate, now) === "active");
                const groupSum = groupActive.reduce((s, l) => s + currentRentCentsOf(l, now) + l.rentComponents.reduce((x, c) => x + c.amountCents, 0), 0);
                const toggleHref = buildCollapseHref(currentParams, g.property.id, collapsedSet);

                return (
                  <section key={g.property.id}>
                    {showSectionHeaders && (
                      <Link
                        href={toggleHref}
                        scroll={false}
                        className="flex items-center justify-between gap-3 px-1 py-2 mb-2 rounded-md hover:bg-muted/30 transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {collapsed
                            ? <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                            : <ChevronDown  className="size-4 text-muted-foreground shrink-0" />
                          }
                          <h2 className="text-base font-semibold truncate">
                            {g.property.street}, {g.property.city}
                          </h2>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {g.leases.length} {g.leases.length === 1 ? "Vertrag" : "Verträge"}
                          {groupActive.length > 0 && (
                            <>
                              {" · "}{groupActive.length} aktiv
                              {" · Σ "}{formatMoney(groupSum)}
                            </>
                          )}
                        </p>
                      </Link>
                    )}

                    {!collapsed && (
                      <>
                        {/* Mobile: Card-Liste */}
                        <div className="space-y-3 md:hidden">
                          {g.leases.map((l) => {
                            const sv = leaseStatusValue(l.startDate, l.endDate, now);
                            const meta = STATUS_META[sv];
                            return (
                              <Link
                                key={l.id}
                                href={`/leases/${l.id}`}
                                className="block rounded-xl border bg-card px-4 py-3 active:bg-muted/30 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-3 mb-1">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">{l.unit.name}</p>
                                    {!showSectionHeaders && (
                                      <p className="text-xs text-muted-foreground truncate">{l.unit.property.street}, {l.unit.property.city}</p>
                                    )}
                                  </div>
                                  <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                                  <div className="text-muted-foreground truncate">
                                    {l.leaseTenants.map((lt, i) => (
                                      <span key={lt.tenant.id}>
                                        {i > 0 && <span className="mx-1">·</span>}
                                        <Private>{lt.tenant.lastName}, {lt.tenant.firstName}</Private>
                                      </span>
                                    ))}
                                  </div>
                                  <p className="tabular-nums font-semibold text-foreground shrink-0">{formatMoney(currentRentCentsOf(l, now))}</p>
                                </div>
                                {l.rentComponents.length > 0 && (
                                  <div className="mt-2 border-t pt-2 space-y-0.5">
                                    {l.rentComponents.map((c) => (
                                      <div key={c.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{componentLabel(c)}</span>
                                        <span className="tabular-nums">{formatMoney(c.amountCents)}</span>
                                      </div>
                                    ))}
                                    <div className="flex items-center justify-between text-xs font-medium pt-0.5">
                                      <span>Gesamt</span>
                                      <span className="tabular-nums">
                                        {formatMoney(currentRentCentsOf(l, now) + l.rentComponents.reduce((s, c) => s + c.amountCents, 0))}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </Link>
                            );
                          })}
                        </div>

                        {/* Desktop: Tabelle */}
                        <div className="hidden md:block rounded-xl border overflow-x-auto">
                          <table className="w-full text-sm">
                          <thead className="bg-muted/40">
                            <tr className="border-b">
                              <th className="text-left px-4 py-3 font-medium">Wohneinheit</th>
                              <th className="text-left px-4 py-3 font-medium">Mieter</th>
                              <th className="text-right px-4 py-3 font-medium">Kaltmiete</th>
                              <th className="text-left px-4 py-3 font-medium">Laufzeit</th>
                              <th className="text-left px-4 py-3 font-medium">Status</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody>
                            {g.leases.map((l) => {
                              const sv = leaseStatusValue(l.startDate, l.endDate, now);
                              const meta = STATUS_META[sv];
                              return (
                                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3">
                                    <Link href={`/leases/${l.id}`} className="hover:underline font-medium">
                                      {l.unit.name}
                                    </Link>
                                    {!showSectionHeaders && (
                                      <div className="text-xs text-muted-foreground">{l.unit.property.street}, {l.unit.property.city}</div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    {l.leaseTenants.map((lt, i) => (
                                      <span key={lt.tenant.id}>
                                        {i > 0 && <span className="text-muted-foreground mx-1">·</span>}
                                        <Link href={`/tenants/${lt.tenant.id}`} className="hover:underline">
                                          <Private>{lt.tenant.lastName}, {lt.tenant.firstName}</Private>
                                        </Link>
                                      </span>
                                    ))}
                                  </td>
                                  <td className="px-4 py-3 text-right tabular-nums">
                                    <div>{formatMoney(currentRentCentsOf(l, now))}</div>
                                    <div className="text-xs text-muted-foreground">{rentTypeLabels[l.rentType] ?? l.rentType}</div>
                                    {l.rentComponents.length > 0 && (
                                      <div className="mt-1 space-y-0.5 border-t pt-1">
                                        {l.rentComponents.map((c) => (
                                          <div key={c.id} className="text-xs text-muted-foreground flex items-center justify-end gap-2">
                                            <span>{componentLabel(c)}</span>
                                            <span className="tabular-nums">{formatMoney(c.amountCents)}</span>
                                          </div>
                                        ))}
                                        <div className="text-xs font-medium flex items-center justify-end gap-2 pt-0.5">
                                          <span>Gesamt</span>
                                          <span className="tabular-nums">
                                            {formatMoney(currentRentCentsOf(l, now) + l.rentComponents.reduce((s, c) => s + c.amountCents, 0))}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground text-xs">
                                    {formatDate(l.startDate, "–")} –<br />{formatDate(l.endDate, "unbefristet")}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant={meta.variant}>{meta.label}</Badge>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Button asChild variant="ghost" size="icon">
                                      <Link href={`/leases/${l.id}/edit`}>
                                        <Pencil className="size-4" />
                                      </Link>
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
