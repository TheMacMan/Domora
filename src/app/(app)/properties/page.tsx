import { todayLocal } from "@/lib/dates";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getPropertiesAction } from "@/server/actions/properties";
import { deleteUnitAction } from "@/server/actions/units";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { Private } from "@/components/private";
import { Building2, Plus, Pencil, Trash2, Home } from "lucide-react";

export const metadata = { title: "Objekte – Domora" };

function floorLabel(floor: number | null | undefined) {
  if (floor == null) return null;
  if (floor === 0) return "EG";
  if (floor < 0) return `UG${Math.abs(floor)}`;
  return `${floor}. OG`;
}

type Lease = {
  id: string;
  startDate: string;
  endDate: string | null;
  rentCents: number;
  serviceChargesCents: number | null;
  rentType: string;
  leaseTenants: Array<{ tenant: { firstName: string; lastName: string } }>;
};

function unitOccupancy(leases: Lease[], today: string) {
  const active = leases.find(
    (l) => l.startDate <= today && (!l.endDate || l.endDate >= today)
  );
  if (active) return { kind: "active" as const, lease: active };

  const upcoming = leases
    .filter((l) => l.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (upcoming) return { kind: "upcoming" as const, lease: upcoming };

  return { kind: "vacant" as const, lease: null };
}

function tenantNames(leaseTenants: Array<{ tenant: { firstName: string; lastName: string } }>) {
  return leaseTenants.map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`).join(" · ");
}

const rentTypeShort: Record<string, string> = {
  fixed: "Fest",
  index: "Index",
  graduated: "Staffel",
};

export default async function PropertiesPage() {
  const properties = await getPropertiesAction();
  const today = todayLocal();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Objekte</h1>
          {properties.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {properties.length} Objekt{properties.length !== 1 ? "e" : ""} ·{" "}
              {properties.reduce((s, p) => s + p.units.length, 0)} Wohneinheiten
            </p>
          )}
        </div>
        <Button asChild size="sm">
          <Link href="/properties/new">
            <Plus className="size-4" />
            Neues Objekt
          </Link>
        </Button>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Building2 className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Noch keine Objekte angelegt.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/properties/new">Erstes Objekt anlegen</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {properties.map((property) => {
            const totalArea = property.units.reduce((s, u) => s + u.livingArea, 0);
            const occupiedCount = property.units.filter(
              (u) => unitOccupancy(u.leases, today).kind === "active"
            ).length;

            async function handleDeleteUnit(unitId: string) {
              "use server";
              await deleteUnitAction(unitId);
              revalidatePath("/properties");
            }

            return (
              <div key={property.id} className="rounded-xl border bg-card overflow-hidden shadow-sm">
                {/* Property header */}
                <div className="px-5 py-4 border-b bg-muted/30 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold">
                        <Link href={`/properties/${property.id}`} className="hover:underline">
                          {property.street}
                        </Link>
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {property.postalCode} {property.city}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {property.yearBuilt && <span>Baujahr {property.yearBuilt}</span>}
                      {totalArea > 0 && (
                        <span>
                          {totalArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²
                        </span>
                      )}
                      <span>
                        AfA {(property.depreciationPermille / 10).toLocaleString("de-DE", { minimumFractionDigits: 1 })} %
                      </span>
                      {property.purchasePriceTotal != null && (
                        <span>Kaufpreis {formatMoney(property.purchasePriceTotal)}</span>
                      )}
                      {property.units.length > 0 && (
                        <span className="font-medium text-foreground/70">
                          {occupiedCount}/{property.units.length} vermietet
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button asChild variant="ghost" size="iconSm" className="">
                      <Link href={`/properties/${property.id}/edit`} title="Objekt bearbeiten">
                        <Pencil className="size-3.5" />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="text-xs h-8 px-2 text-muted-foreground">
                      <Link href={`/properties/${property.id}`}>Details →</Link>
                    </Button>
                  </div>
                </div>

                {/* Unit rows */}
                {property.units.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    <Home className="size-5 mx-auto mb-2 opacity-40" />
                    Noch keine Wohneinheiten angelegt.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {property.units.map((unit) => {
                        const occ = unitOccupancy(unit.leases, today);
                        return (
                          <tr key={unit.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
                            {/* Einheit */}
                            <td className="px-4 sm:px-5 py-3 min-w-0 sm:w-[220px]">
                              <div className="font-medium">{unit.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {floorLabel(unit.floor) ?? "–"} ·{" "}
                                {unit.livingArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²
                              </div>
                            </td>

                            {/* Belegung */}
                            <td className="px-4 py-3">
                              {occ.kind === "active" && (
                                <div>
                                  <Link
                                    href={`/leases/${occ.lease.id}`}
                                    className="font-medium hover:underline"
                                  >
                                    <Private>{tenantNames(occ.lease.leaseTenants)}</Private>
                                  </Link>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {formatMoney(occ.lease.rentCents)}
                                    {occ.lease.serviceChargesCents != null && (
                                      <> + {formatMoney(occ.lease.serviceChargesCents)} NK</>
                                    )}{" "}
                                    · {rentTypeShort[occ.lease.rentType] ?? occ.lease.rentType}
                                  </div>
                                </div>
                              )}
                              {occ.kind === "upcoming" && (
                                <div>
                                  <Link
                                    href={`/leases/${occ.lease.id}`}
                                    className="font-medium hover:underline text-muted-foreground"
                                  >
                                    <Private>{tenantNames(occ.lease.leaseTenants)}</Private>
                                  </Link>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    ab {new Date(occ.lease.startDate).toLocaleDateString("de-DE")}
                                  </div>
                                </div>
                              )}
                              {occ.kind === "vacant" && (
                                <span className="text-muted-foreground text-sm">Leerstand</span>
                              )}
                            </td>

                            {/* Status badge */}
                            <td className="px-4 py-3 hidden md:table-cell">
                              {occ.kind === "active" && <Badge variant="success">Aktiv</Badge>}
                              {occ.kind === "upcoming" && <Badge variant="warning">Bald</Badge>}
                              {occ.kind === "vacant" && <Badge variant="secondary">Leer</Badge>}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3 text-right">
                              <div className="flex gap-1 justify-end md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <Button asChild variant="ghost" size="iconSm">
                                  <Link
                                    href={`/properties/${property.id}/units/${unit.id}/edit`}
                                    title="Wohneinheit bearbeiten"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Link>
                                </Button>
                                <form action={handleDeleteUnit.bind(null, unit.id)}>
                                  <Button
                                    variant="ghost"
                                    size="iconSm"
                                    type="submit"
                                    className="text-muted-foreground hover:text-destructive"
                                    title="Wohneinheit löschen"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </form>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}

                {/* Add unit footer */}
                <div className="px-5 py-3 border-t bg-muted/10">
                  <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground -ml-2">
                    <Link href={`/properties/${property.id}/units/new`}>
                      <Plus className="size-3.5" />
                      Wohneinheit hinzufügen
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
