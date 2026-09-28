// Fahrzeugjahr berechnen und Fahrtkosten-Ausgaben aus den Fahrten erzeugen/aktualisieren.
// Kein Server-Action-Modul — nur aus Server Actions / Server Components aufrufen.

import { createId } from "@paralleldrive/cuid2";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { expenses, trips, vehicleCosts, vehicleOdometer, vehicleYears, vehicles } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { computeVehicleYear, formatRate, tripAmountCents, type VehicleYearResult } from "@/lib/vehicle-rate";
import { formatKm } from "@/lib/vehicle";

export async function ensureVehicleYear(vehicleId: string, year: number) {
  const existing = await db.query.vehicleYears.findFirst({ where: and(eq(vehicleYears.vehicleId, vehicleId), eq(vehicleYears.year, year)) });
  if (existing) return existing;
  const row = { id: createId(), vehicleId, year, method: "actual" as const, estimatedKm: null, notes: null };
  await db.insert(vehicleYears).values(row);
  return (await db.query.vehicleYears.findFirst({ where: eq(vehicleYears.id, row.id) }))!;
}

export async function computeVehicleYearFor(vehicleId: string, year: number): Promise<{ result: VehicleYearResult; yearId: string } | null> {
  const vehicle = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, vehicleId), isNull(vehicles.deletedAt)) });
  if (!vehicle) return null;
  const [vy, costs, odometer] = await Promise.all([
    ensureVehicleYear(vehicleId, year),
    db.query.vehicleCosts.findMany({ where: and(eq(vehicleCosts.vehicleId, vehicleId), isNull(vehicleCosts.deletedAt)) }),
    db.query.vehicleOdometer.findMany({ where: and(eq(vehicleOdometer.vehicleId, vehicleId), isNull(vehicleOdometer.deletedAt)) }),
  ]);
  const result = computeVehicleYear({
    year,
    vehicle,
    method: vy.method,
    estimatedKm: vy.estimatedKm,
    costs,
    odometer,
  });
  return { result, yearId: vy.id };
}

function rateNote(r: VehicleYearResult) {
  if (r.method === "flat") return "Pauschale 0,30 €/km";
  if (r.rateCentsPerKm == null) return "km-Satz fehlt (km-Stand und Schätzung fehlen)";
  const base = `${formatRate(r.rateCentsPerKm)} €/km (Kosten ${(r.costCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} € ÷ ${formatKm(r.basisKm ?? 0)} km`;
  return r.provisional ? `${base}, vorläufig: geschätzte km)` : `${base} lt. km-Stand)`;
}

// Alle Fahrten eines Fahrzeugjahres neu bewerten und die Ausgaben angleichen
export async function syncTripExpenses(userId: string, vehicleId: string, year: number) {
  const calc = await computeVehicleYearFor(vehicleId, year);
  if (!calc) return;
  const { result } = calc;
  const rows = await db.query.trips.findMany({
    where: and(eq(trips.vehicleId, vehicleId), gte(trips.date, `${year}-01-01`), lte(trips.date, `${year}-12-31`)),
  });
  let changed = 0;
  for (const tr of rows) {
    const existing = tr.expenseId ? await db.query.expenses.findFirst({ where: eq(expenses.id, tr.expenseId) }) : null;
    if (tr.deletedAt) {
      if (existing && !existing.deletedAt) {
        await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, existing.id));
        changed++;
      }
      continue;
    }
    const values = {
      propertyId: tr.propertyId,
      category: "other" as const,
      amountCents: tripAmountCents(tr.km, result) ?? 0,
      date: tr.date,
      description: `Fahrtkosten – ${tr.purpose}`,
      isRecurring: false,
      tripId: tr.id,
      notes: `${tr.route} · ${formatKm(tr.km)} km × ${rateNote(result)} · aus Fahrtenliste`,
    };
    if (existing && !existing.deletedAt) {
      const same = existing.amountCents === values.amountCents && existing.date === values.date && existing.propertyId === values.propertyId
        && existing.description === values.description && existing.notes === values.notes;
      if (!same) {
        await db.update(expenses).set({ ...values, updatedAt: new Date() }).where(eq(expenses.id, existing.id));
        changed++;
      }
    } else {
      const id = createId();
      await db.insert(expenses).values({ id, ...values });
      await db.update(trips).set({ expenseId: id }).where(eq(trips.id, tr.id));
      changed++;
    }
  }
  if (changed > 0) {
    await writeAuditLog({ userId, action: "trip.sync", entity: "vehicle", entityId: vehicleId, after: { year, changed, rate: result.rateCentsPerKm, provisional: result.provisional } });
  }
}

// Jahre, in denen ein Fahrzeug Fahrten oder Kosten hat bzw. genutzt wurde
export function vehicleYearsInUse(v: { inUseFrom: string; inUseTo: string | null }, today: string): number[] {
  const from = +v.inUseFrom.slice(0, 4);
  const to = +(v.inUseTo ?? today).slice(0, 4);
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

export type TripLogData = {
  vehicle: { name: string; plate: string | null };
  year: number;
  result: VehicleYearResult;
  trips: Array<{ date: string; property: string; route: string; purpose: string; km: number; cents: number }>;
};

// Daten der Fahrtenliste (PDF) für ein Fahrzeugjahr
export async function buildTripLogData(vehicleId: string, year: number): Promise<TripLogData | null> {
  const vehicle = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, vehicleId), isNull(vehicles.deletedAt)) });
  const calc = await computeVehicleYearFor(vehicleId, year);
  if (!vehicle || !calc) return null;
  const rows = await db.query.trips.findMany({
    where: and(eq(trips.vehicleId, vehicleId), isNull(trips.deletedAt), gte(trips.date, `${year}-01-01`), lte(trips.date, `${year}-12-31`)),
    with: { property: true },
    orderBy: (t, { asc }) => [asc(t.date), asc(t.createdAt)],
  });
  return {
    vehicle: { name: vehicle.name, plate: vehicle.plate },
    year,
    result: calc.result,
    trips: rows.map((t) => ({
      date: t.date,
      property: `${t.property.street}, ${t.property.city}`,
      route: t.route,
      purpose: t.purpose,
      km: t.km,
      cents: tripAmountCents(t.km, calc.result) ?? 0,
    })),
  };
}
