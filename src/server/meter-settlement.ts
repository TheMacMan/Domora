// Zwischenzähler-Abrechnung zusammenstellen (Zähler, Preise, Mieter) — kein Server-Action-Modul.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { leases, meters, supplyPrices } from "@/db/schema";
import { billMeters, type BillingResult, type PriceInput } from "@/lib/meter-billing";
import type { SettlementInput } from "@/lib/validators/meter";

export function tenantNames(l: { leaseTenants: Array<{ tenant: { firstName: string; lastName: string } }> }) {
  return l.leaseTenants.map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`).join(", ") || "(ohne Mieter)";
}

// Preise aller Verträge einer Wohnung (Stromvertrag), jeweils wirksam frühestens ab Vertragsbeginn
async function pricesForUnit(unitId: string): Promise<PriceInput[]> {
  const unitLeases = await db.query.leases.findMany({ where: and(eq(leases.unitId, unitId), isNull(leases.deletedAt)) });
  if (unitLeases.length === 0) return [];
  const rows = await db.query.supplyPrices.findMany({
    where: and(inArray(supplyPrices.leaseId, unitLeases.map((l) => l.id)), isNull(supplyPrices.deletedAt)),
  });
  const start = new Map(unitLeases.map((l) => [l.id, l.startDate]));
  return rows.map((p) => ({ validFrom: p.validFrom > start.get(p.leaseId)! ? p.validFrom : start.get(p.leaseId)!, ctPerKwh: p.ctPerKwh }));
}

export type SettlementPlan = {
  lease: NonNullable<Awaited<ReturnType<typeof loadLease>>>;
  billing: BillingResult;
  meterNames: string[];
  hostUnitName: string | null;
};

async function loadLease(leaseId: string) {
  return db.query.leases.findFirst({
    where: and(eq(leases.id, leaseId), isNull(leases.deletedAt)),
    with: { unit: { with: { property: true } }, leaseTenants: { with: { tenant: true } } },
  });
}

// Erstattung: alle Zähler am Stromvertrag dieser Wohnung, Preise dieses Vertrags.
// Rechnung: Zähler, deren Verbraucher diese Wohnung ist; Preise des Stromvertrags (Host-Wohnung).
export async function planSettlement(input: SettlementInput): Promise<SettlementPlan | { error: string }> {
  const lease = await loadLease(input.leaseId);
  if (!lease) return { error: "Mietvertrag nicht gefunden." };
  if (input.periodStart < lease.startDate) return { error: "Beginn liegt vor dem Mietbeginn." };
  if (lease.endDate && input.periodEnd > nextDay(lease.endDate)) return { error: "Ende liegt nach dem Mietende." };

  const where = input.direction === "refund"
    ? and(eq(meters.hostUnitId, lease.unitId), isNull(meters.deletedAt))
    : and(eq(meters.unitId, lease.unitId), eq(meters.purpose, "unit"), isNull(meters.deletedAt));
  const list = await db.query.meters.findMany({ where, with: { readings: true, hostUnit: true } });
  if (list.length === 0) return { error: input.direction === "refund" ? "Am Stromvertrag dieser Wohnung hängt kein Zwischenzähler." : "Für diese Wohnung gibt es keinen Verbrauchszähler." };

  // Preise: bei Erstattung nur die des Empfängervertrags, bei Rechnung die der Host-Wohnung (auch bei Mieterwechsel)
  let prices: PriceInput[];
  if (input.direction === "refund") {
    prices = (await db.query.supplyPrices.findMany({ where: and(eq(supplyPrices.leaseId, lease.id), isNull(supplyPrices.deletedAt)) }))
      .map((p) => ({ validFrom: p.validFrom, ctPerKwh: p.ctPerKwh }));
  } else {
    const hostIds = [...new Set(list.map((m) => m.hostUnitId))];
    if (hostIds.length > 1) return { error: "Zähler hängen an verschiedenen Stromverträgen — bitte einzeln abrechnen." };
    prices = await pricesForUnit(hostIds[0]!);
  }

  const billing = billMeters(
    list.map((m) => ({
      id: m.id, name: m.name, kind: m.kind, purpose: m.purpose, estimateKwhPerYear: m.estimateKwhPerYear,
      readings: m.readings.filter((r) => r.deletedAt == null).map((r) => ({ date: r.date, value: r.value })),
    })),
    prices,
    input.periodStart,
    input.periodEnd,
  );
  return { lease, billing, meterNames: list.map((m) => m.name), hostUnitName: list[0]?.hostUnit.name ?? null };
}

function nextDay(d: string) {
  return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1)).toISOString().slice(0, 10);
}
