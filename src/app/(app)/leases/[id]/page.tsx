import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLeaseAction, deleteLeaseAction } from "@/server/actions/leases";
import { deleteRentAdjustmentAction } from "@/server/actions/rent-adjustments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate, todayLocal } from "@/lib/dates";
import { Private } from "@/components/private";
import { RENT_COMPONENT_LABELS, type RentComponentKind } from "@/lib/validators/lease";
import { effectiveRentAt } from "@/lib/rent";
import { Pencil, Trash2, Plus } from "lucide-react";

export const metadata = { title: "Mietvertrag – Domora" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2.5 border-b last:border-0 gap-4">
      <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm text-right">{value ?? "–"}</dd>
    </div>
  );
}

const rentTypeLabels: Record<string, string> = {
  fixed: "Festmiete",
  index: "Indexmiete",
  graduated: "Staffelmiete",
};

export default async function LeasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lease = await getLeaseAction(id);

  if (!lease || lease.deletedAt) notFound();

  const adjustments = lease.rentAdjustments;
  const today = todayLocal();

  // Aktuell geltender Mietzins (mit NK-Carry-Forward)
  const currentAdj = [...adjustments].reverse().find((a) => a.effectiveDate <= today);
  const currentEffective = effectiveRentAt(lease, adjustments, today);
  const currentRentCents = currentEffective.rentCents;
  const currentSCCents = currentEffective.serviceChargesCents;

  async function handleDelete() {
    "use server";
    await deleteLeaseAction(id);
    revalidatePath("/leases");
    redirect("/leases");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lease.unit.name}</h1>
          <p className="text-muted-foreground mt-1">
            {lease.unit.property.street}, {lease.unit.property.postalCode} {lease.unit.property.city}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`/leases/${id}/edit`}>
              <Pencil className="size-4" />
              Bearbeiten
            </Link>
          </Button>
          <form action={handleDelete}>
            <Button variant="destructive" size="sm" type="submit">
              <Trash2 className="size-4" />
              Löschen
            </Button>
          </form>
        </div>
      </div>

      {/* Stammdaten */}
      <div className="rounded-xl border bg-card shadow-sm">
        <dl className="px-6 py-2">
          <Row
            label={lease.leaseTenants.length > 1 ? "Mieter" : "Mieter"}
            value={
              <span className="flex flex-col gap-1 items-end">
                {lease.leaseTenants.map((lt) => (
                  <Link key={lt.tenant.id} href={`/tenants/${lt.tenant.id}`} className="hover:underline">
                    <Private>{lt.tenant.firstName} {lt.tenant.lastName}</Private>
                  </Link>
                ))}
              </span>
            }
          />
          <Row label="Mietbeginn" value={formatDate(lease.startDate, "–")} />
          <Row label="Mietende" value={formatDate(lease.endDate, "unbefristet")} />
          <Row label="Mietart" value={rentTypeLabels[lease.rentType] ?? lease.rentType} />
          <Row
            label="Kaution"
            value={
              lease.depositFactor != null
                ? `${lease.depositFactor.toLocaleString("de-DE")} NKM${lease.depositCents != null ? ` (= ${formatMoney(lease.depositCents)})` : ""}`
                : lease.depositCents != null
                  ? formatMoney(lease.depositCents)
                  : null
            }
          />
          {lease.notes && <Row label="Notizen" value={<span className="whitespace-pre-wrap">{lease.notes}</span>} />}
        </dl>
      </div>

      {/* Zusätzliche Mietkomponenten */}
      {lease.rentComponents && lease.rentComponents.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="px-6 py-3 border-b">
            <h2 className="text-sm font-semibold">Zusätzliche Mietkomponenten</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Werden zur Kaltmiete addiert</p>
          </div>
          <dl className="px-6 py-2">
            {lease.rentComponents.map((c) => (
              <div key={c.id} className="flex justify-between py-2.5 border-b last:border-0 gap-4">
                <dt className="text-sm">
                  <span className="font-medium">{RENT_COMPONENT_LABELS[c.kind as RentComponentKind]}</span>
                  {c.description && <span className="text-muted-foreground ml-2">{c.description}</span>}
                </dt>
                <dd className="text-sm tabular-nums">{formatMoney(c.amountCents)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Aktuelle Miete */}
      <div className="rounded-xl border bg-primary/5 border-primary/20 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            Aktuell geltende Miete{lease.rentComponents && lease.rentComponents.length > 0 && " (inkl. Komponenten)"}
          </p>
          {(() => {
            const componentsCents = (lease.rentComponents ?? []).reduce((s, c) => s + c.amountCents, 0);
            const coldTotal = currentRentCents + componentsCents;
            const warmTotal = coldTotal + (currentSCCents ?? 0);
            return (
              <p className="text-2xl font-bold tabular-nums">
                {formatMoney(coldTotal)}
                {currentSCCents != null && (
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    + {formatMoney(currentSCCents)} NK = {formatMoney(warmTotal)} warm
                  </span>
                )}
              </p>
            );
          })()}
        </div>
        <Button asChild size="sm">
          <Link href={`/leases/${id}/rent-adjustments/new`}>
            <Plus className="size-4" />
            Anpassung erfassen
          </Link>
        </Button>
      </div>

      {/* Miethistorie */}
      <div>
        <h2 className="text-base font-semibold mb-4">Mietentwicklung</h2>
        <div className="rounded-xl border overflow-x-auto bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="text-left px-4 py-3 font-medium">Gültig ab</th>
                <th className="text-right px-4 py-3 font-medium">Kaltmiete</th>
                <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">NK</th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Warm</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Grund</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(() => {
                const componentsCents = (lease.rentComponents ?? []).reduce((s, c) => s + c.amountCents, 0);
                return (
                  <tr className="border-b last:border-0 bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(lease.startDate, "–")}
                      <Badge variant="secondary" className="ml-2 text-[10px]">Vertragsstart</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(lease.rentCents)}
                      {componentsCents > 0 && (
                        <p className="text-xs font-normal text-muted-foreground">+ {formatMoney(componentsCents)} Komp.</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {lease.serviceChargesCents != null ? formatMoney(lease.serviceChargesCents) : "–"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                      {formatMoney(lease.rentCents + componentsCents + (lease.serviceChargesCents ?? 0))}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">–</td>
                    <td className="px-4 py-3" />
                  </tr>
                );
              })()}

              {adjustments.map((adj) => {
                const isCurrentOrPast = adj.effectiveDate <= today;
                const isCurrent = adj === currentAdj;
                // Effektive NK an diesem Stichtag (Carry-Forward, falls in dieser Anpassung nicht gesetzt)
                const effNK = effectiveRentAt(lease, adjustments, adj.effectiveDate).serviceChargesCents;
                const nkChanged = adj.serviceChargesCents != null;
                const componentsCents = (lease.rentComponents ?? []).reduce((s, c) => s + c.amountCents, 0);

                async function handleDeleteAdj() {
                  "use server";
                  await deleteRentAdjustmentAction(adj.id, id);
                }

                return (
                  <tr key={adj.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {formatDate(adj.effectiveDate)}
                      {isCurrent && <Badge variant="success" className="ml-2 text-[10px]">Aktuell</Badge>}
                      {!isCurrentOrPast && <Badge variant="warning" className="ml-2 text-[10px]">Geplant</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatMoney(adj.rentCents)}
                      {componentsCents > 0 && (
                        <p className="text-xs font-normal text-muted-foreground">+ {formatMoney(componentsCents)} Komp.</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {effNK != null
                        ? <>{formatMoney(effNK)}{!nkChanged && <span className="ml-1 text-xs italic">(unverändert)</span>}</>
                        : "–"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                      {formatMoney(adj.rentCents + componentsCents + (effNK ?? 0))}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {adj.reason ?? "–"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={handleDeleteAdj}>
                        <Button variant="ghost" size="iconSm" className=" text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })}

              {adjustments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Noch keine Anpassungen.{" "}
                    <Link href={`/leases/${id}/rent-adjustments/new`} className="underline hover:no-underline">
                      Erste Anpassung erfassen
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/leases">← Alle Verträge</Link>
        </Button>
      </div>
    </div>
  );
}
