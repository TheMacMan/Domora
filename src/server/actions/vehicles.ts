"use server";

import { createId } from "@paralleldrive/cuid2";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { documentLinks, documents, properties, tripRoutes, trips, vehicleCosts, vehicleOdometer, vehicleYears, vehicles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { todayLocal } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { frequentDestinations, tripAmountCents } from "@/lib/vehicle-rate";
import {
  odometerSchema,
  tripRouteSchema,
  tripSchema,
  vehicleCostSchema,
  vehicleSchema,
  vehicleYearSchema,
  type OdometerInput,
  type TripInput,
  type TripRouteInput,
  type VehicleCostInput,
  type VehicleInput,
} from "@/lib/validators/vehicle";
import { buildTripLogData, computeVehicleYearFor, ensureVehicleYear, syncTripExpenses, vehicleYearsInUse } from "@/server/trip-sync";
import { createDocumentLink, loadReceiptContext } from "@/server/receipt-links";

type ActionResult = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };

function revalidateVehicleViews() {
  revalidatePath("/expenses", "layout");
  revalidatePath("/tax", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

// Alle Jahre eines Fahrzeugs neu bewerten (z. B. nach Kosten-/km-Stand-Änderung)
async function resyncVehicle(userId: string, vehicleId: string, years?: number[]) {
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId) });
  if (!v) return;
  const tripYears = (await db.query.trips.findMany({ where: eq(trips.vehicleId, vehicleId), columns: { date: true } })).map((t) => +t.date.slice(0, 4));
  const all = new Set([...(years ?? []), ...tripYears]);
  for (const y of all) await syncTripExpenses(userId, vehicleId, y);
}

// ── Fahrzeuge ────────────────────────────────────────────────────────────────

function vehicleDb(d: VehicleInput) {
  return {
    name: d.name,
    plate: d.plate || null,
    fuelType: d.fuelType,
    ownership: d.ownership,
    inUseFrom: d.inUseFrom,
    inUseTo: d.inUseTo || null,
    notes: d.notes || null,
  };
}

export async function createVehicleAction(data: VehicleInput): Promise<CreateResult> {
  const user = await requireUser();
  const parsed = vehicleSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const id = createId();
  await db.insert(vehicles).values({ id, ...vehicleDb(parsed.data) });
  await writeAuditLog({ userId: user.id, action: "vehicle.create", entity: "vehicle", entityId: id, after: parsed.data });
  revalidateVehicleViews();
  return { ok: true, id };
}

export async function updateVehicleAction(id: string, data: VehicleInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = vehicleSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const before = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, id), isNull(vehicles.deletedAt)) });
  if (!before) return { ok: false, error: "Fahrzeug nicht gefunden." };
  await db.update(vehicles).set({ ...vehicleDb(parsed.data), updatedAt: new Date() }).where(eq(vehicles.id, id));
  await writeAuditLog({ userId: user.id, action: "vehicle.update", entity: "vehicle", entityId: id, before: before as Record<string, unknown>, after: parsed.data });
  await resyncVehicle(user.id, id);
  revalidateVehicleViews();
  return { ok: true };
}

export async function deleteVehicleAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const v = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, id), isNull(vehicles.deletedAt)) });
  if (!v) return { ok: false, error: "Fahrzeug nicht gefunden." };
  const hasTrips = await db.query.trips.findFirst({ where: and(eq(trips.vehicleId, id), isNull(trips.deletedAt)) });
  if (hasTrips) return { ok: false, error: "Das Fahrzeug hat Fahrten. Bitte zuerst die Fahrten einem anderen Fahrzeug zuordnen oder löschen." };
  await db.update(vehicles).set({ deletedAt: new Date() }).where(eq(vehicles.id, id));
  await writeAuditLog({ userId: user.id, action: "vehicle.delete", entity: "vehicle", entityId: id, before: v as Record<string, unknown> });
  revalidateVehicleViews();
  return { ok: true };
}

// ── km-Stände ────────────────────────────────────────────────────────────────

export async function addOdometerAction(vehicleId: string, data: OdometerInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = odometerSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const v = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, vehicleId), isNull(vehicles.deletedAt)) });
  if (!v) return { ok: false, error: "Fahrzeug nicht gefunden." };
  const id = createId();
  await db.insert(vehicleOdometer).values({ id, vehicleId, ...parsed.data, note: parsed.data.note || null });
  await writeAuditLog({ userId: user.id, action: "vehicle.odometer.create", entity: "vehicle", entityId: vehicleId, after: { id, ...parsed.data } });
  await resyncVehicle(user.id, vehicleId);
  revalidateVehicleViews();
  return { ok: true };
}

export async function deleteOdometerAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.query.vehicleOdometer.findFirst({ where: and(eq(vehicleOdometer.id, id), isNull(vehicleOdometer.deletedAt)) });
  if (!r) return { ok: false, error: "km-Stand nicht gefunden." };
  await db.update(vehicleOdometer).set({ deletedAt: new Date() }).where(eq(vehicleOdometer.id, id));
  await writeAuditLog({ userId: user.id, action: "vehicle.odometer.delete", entity: "vehicle", entityId: r.vehicleId, before: r as Record<string, unknown> });
  await resyncVehicle(user.id, r.vehicleId);
  revalidateVehicleViews();
  return { ok: true };
}

// ── Fahrzeugkosten ───────────────────────────────────────────────────────────

function costDb(d: VehicleCostInput) {
  return {
    date: d.date,
    category: d.category,
    amountCents: toCents(d.amountEur),
    description: d.description || null,
    servicePeriodStart: d.servicePeriodStart || null,
    servicePeriodEnd: d.servicePeriodEnd || null,
    notes: d.notes || null,
  };
}

export async function createVehicleCostAction(vehicleId: string, data: VehicleCostInput): Promise<CreateResult> {
  const user = await requireUser();
  const parsed = vehicleCostSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const v = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, vehicleId), isNull(vehicles.deletedAt)) });
  if (!v) return { ok: false, error: "Fahrzeug nicht gefunden." };
  const id = createId();
  await db.insert(vehicleCosts).values({ id, vehicleId, ...costDb(parsed.data) });
  await writeAuditLog({ userId: user.id, action: "vehicle.cost.create", entity: "vehicle_cost", entityId: id, after: parsed.data });
  await resyncVehicle(user.id, vehicleId);
  revalidateVehicleViews();
  return { ok: true, id };
}

export async function updateVehicleCostAction(id: string, data: VehicleCostInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = vehicleCostSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const before = await db.query.vehicleCosts.findFirst({ where: and(eq(vehicleCosts.id, id), isNull(vehicleCosts.deletedAt)) });
  if (!before) return { ok: false, error: "Kosten nicht gefunden." };
  await db.update(vehicleCosts).set({ ...costDb(parsed.data), updatedAt: new Date() }).where(eq(vehicleCosts.id, id));
  await writeAuditLog({ userId: user.id, action: "vehicle.cost.update", entity: "vehicle_cost", entityId: id, before: before as Record<string, unknown>, after: parsed.data });
  await resyncVehicle(user.id, before.vehicleId);
  revalidateVehicleViews();
  return { ok: true };
}

export async function deleteVehicleCostAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const before = await db.query.vehicleCosts.findFirst({ where: and(eq(vehicleCosts.id, id), isNull(vehicleCosts.deletedAt)) });
  if (!before) return { ok: false, error: "Kosten nicht gefunden." };
  await db.update(vehicleCosts).set({ deletedAt: new Date() }).where(eq(vehicleCosts.id, id));
  await writeAuditLog({ userId: user.id, action: "vehicle.cost.delete", entity: "vehicle_cost", entityId: id, before: before as Record<string, unknown> });
  await resyncVehicle(user.id, before.vehicleId);
  revalidateVehicleViews();
  return { ok: true };
}

// ── Jahr: Methode und Schätzung ──────────────────────────────────────────────

export async function updateVehicleYearAction(vehicleId: string, year: number, data: { method: "actual" | "flat"; estimatedKm: number | null }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = vehicleYearSchema.safeParse(data);
  if (!parsed.success || !Number.isInteger(year)) return { ok: false, error: "Ungültige Eingabe." };
  const vy = await ensureVehicleYear(vehicleId, year);
  await db.update(vehicleYears).set({ ...parsed.data, updatedAt: new Date() }).where(eq(vehicleYears.id, vy.id));
  await writeAuditLog({ userId: user.id, action: "vehicle.year.update", entity: "vehicle", entityId: vehicleId, before: vy as Record<string, unknown>, after: { year, ...parsed.data } });
  await syncTripExpenses(user.id, vehicleId, year);
  revalidateVehicleViews();
  return { ok: true };
}

// ── Fahrten ──────────────────────────────────────────────────────────────────

async function checkTripRefs(d: TripInput): Promise<string | null> {
  const [v, p] = await Promise.all([
    db.query.vehicles.findFirst({ where: and(eq(vehicles.id, d.vehicleId), isNull(vehicles.deletedAt)) }),
    db.query.properties.findFirst({ where: and(eq(properties.id, d.propertyId), isNull(properties.deletedAt)) }),
  ]);
  if (!v) return "Fahrzeug nicht gefunden.";
  if (!p) return "Objekt nicht gefunden.";
  if (d.date < v.inUseFrom || (v.inUseTo && d.date > v.inUseTo)) return "Das Fahrzeug war an diesem Datum nicht in Nutzung.";
  return null;
}

export async function createTripAction(data: TripInput): Promise<CreateResult> {
  const user = await requireUser();
  const parsed = tripSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const err = await checkTripRefs(parsed.data);
  if (err) return { ok: false, error: err };
  const id = createId();
  await db.insert(trips).values({ id, ...parsed.data });
  await writeAuditLog({ userId: user.id, action: "trip.create", entity: "trip", entityId: id, after: parsed.data });
  await syncTripExpenses(user.id, parsed.data.vehicleId, +parsed.data.date.slice(0, 4));
  revalidateVehicleViews();
  return { ok: true, id };
}

export async function updateTripAction(id: string, data: TripInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = tripSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const before = await db.query.trips.findFirst({ where: and(eq(trips.id, id), isNull(trips.deletedAt)) });
  if (!before) return { ok: false, error: "Fahrt nicht gefunden." };
  const err = await checkTripRefs(parsed.data);
  if (err) return { ok: false, error: err };
  await db.update(trips).set({ ...parsed.data, updatedAt: new Date() }).where(eq(trips.id, id));
  await writeAuditLog({ userId: user.id, action: "trip.update", entity: "trip", entityId: id, before: before as Record<string, unknown>, after: parsed.data });
  await syncTripExpenses(user.id, parsed.data.vehicleId, +parsed.data.date.slice(0, 4));
  if (before.vehicleId !== parsed.data.vehicleId || before.date.slice(0, 4) !== parsed.data.date.slice(0, 4)) {
    await syncTripExpenses(user.id, before.vehicleId, +before.date.slice(0, 4));
  }
  revalidateVehicleViews();
  return { ok: true };
}

export async function deleteTripAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const before = await db.query.trips.findFirst({ where: and(eq(trips.id, id), isNull(trips.deletedAt)) });
  if (!before) return { ok: false, error: "Fahrt nicht gefunden." };
  await db.update(trips).set({ deletedAt: new Date() }).where(eq(trips.id, id));
  await writeAuditLog({ userId: user.id, action: "trip.delete", entity: "trip", entityId: id, before: before as Record<string, unknown> });
  await syncTripExpenses(user.id, before.vehicleId, +before.date.slice(0, 4));
  revalidateVehicleViews();
  return { ok: true };
}

// ── Strecken ─────────────────────────────────────────────────────────────────

export async function createTripRouteAction(data: TripRouteInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = tripRouteSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const id = createId();
  await db.insert(tripRoutes).values({ id, ...parsed.data });
  await writeAuditLog({ userId: user.id, action: "trip.route.create", entity: "trip_route", entityId: id, after: parsed.data });
  revalidatePath("/expenses/trips", "layout");
  return { ok: true };
}

export async function deleteTripRouteAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.query.tripRoutes.findFirst({ where: and(eq(tripRoutes.id, id), isNull(tripRoutes.deletedAt)) });
  if (!r) return { ok: false, error: "Strecke nicht gefunden." };
  await db.update(tripRoutes).set({ deletedAt: new Date() }).where(eq(tripRoutes.id, id));
  await writeAuditLog({ userId: user.id, action: "trip.route.delete", entity: "trip_route", entityId: id, before: r as Record<string, unknown> });
  revalidatePath("/expenses/trips", "layout");
  return { ok: true };
}

// ── Fahrtenliste als Beleg ───────────────────────────────────────────────────

const TRIP_LOG_MARKER = "auto:fahrtenliste";

// Fahrtenliste als PDF erzeugen, unter „Allgemein" ablegen und mit dem Fahrzeugjahr
// verknüpfen. Eine frühere automatisch erzeugte Liste wird abgelöst (Verknüpfung gelöst,
// Datei bleibt archiviert).
export async function saveTripLogReceiptAction(vehicleId: string, year: number): Promise<ActionResult> {
  const user = await requireUser();
  const data = await buildTripLogData(vehicleId, year);
  if (!data) return { ok: false, error: "Fahrzeug nicht gefunden." };
  if (data.trips.length === 0) return { ok: false, error: "Keine Fahrten in diesem Jahr." };
  const vy = await ensureVehicleYear(vehicleId, year);

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { TripLogPdf } = await import("@/lib/pdf/trip-log-pdf");
  const buffer = await renderToBuffer(TripLogPdf({ data }));

  const id = createId();
  const storedName = `${id}.pdf`;
  const dir = path.join(process.cwd(), "data", "uploads", "general", "general");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storedName), new Uint8Array(buffer));
  const filename = `Fahrtenliste_${year}_${data.vehicle.name.replace(/[^\p{L}\p{N}]+/gu, "_")}.pdf`;
  await db.insert(documents).values({
    id, filename, storedName, mimeType: "application/pdf", sizeBytes: buffer.length,
    entityType: "general", entityId: "general", tag: "Fahrzeug & Fahrten", year,
    title: `Fahrtenliste ${year} – ${data.vehicle.name}${data.result.provisional ? " (vorläufig)" : ""}`,
    notes: `${TRIP_LOG_MARKER}:${vy.id} · erstellt ${todayLocal()}`,
  });
  await writeAuditLog({ userId: user.id, action: "document.upload", entity: "document", entityId: id, after: { filename, generated: true, vehicleId, year } });

  // Ältere automatisch erzeugte Liste dieses Fahrzeugjahres lösen
  const oldLinks = await db.query.documentLinks.findMany({
    where: and(eq(documentLinks.targetType, "vehicle_year"), eq(documentLinks.targetId, vy.id), isNull(documentLinks.deletedAt)),
    with: { document: true },
  });
  for (const l of oldLinks) {
    if (l.document.notes?.startsWith(`${TRIP_LOG_MARKER}:${vy.id}`)) {
      await db.update(documentLinks).set({ deletedAt: new Date() }).where(eq(documentLinks.id, l.id));
      await writeAuditLog({ userId: user.id, action: "document.unlink", entity: "document", entityId: l.documentId, before: l as unknown as Record<string, unknown> });
    }
  }
  await createDocumentLink(user.id, id, "vehicle_year", vy.id);
  revalidateVehicleViews();
  revalidatePath("/documents");
  return { ok: true };
}

// ── Lesen ────────────────────────────────────────────────────────────────────

export async function getVehiclesAction() {
  await requireUser();
  return db.query.vehicles.findMany({ where: isNull(vehicles.deletedAt), orderBy: (v, { desc }) => [desc(v.inUseFrom)] });
}

export async function getVehicleDetailAction(id: string) {
  await requireUser();
  const vehicle = await db.query.vehicles.findFirst({ where: and(eq(vehicles.id, id), isNull(vehicles.deletedAt)) });
  if (!vehicle) return null;
  const [odometer, costs, ctx] = await Promise.all([
    db.query.vehicleOdometer.findMany({ where: and(eq(vehicleOdometer.vehicleId, id), isNull(vehicleOdometer.deletedAt)), orderBy: (o, { desc }) => [desc(o.date)] }),
    db.query.vehicleCosts.findMany({ where: and(eq(vehicleCosts.vehicleId, id), isNull(vehicleCosts.deletedAt)), orderBy: (c, { desc }) => [desc(c.date)] }),
    loadReceiptContext(),
  ]);
  const years = [];
  for (const y of vehicleYearsInUse(vehicle, todayLocal()).reverse()) {
    const calc = await computeVehicleYearFor(id, y);
    if (!calc) continue;
    const vy = await db.query.vehicleYears.findFirst({ where: eq(vehicleYears.id, calc.yearId) });
    const tripRows = await db.query.trips.findMany({
      where: and(eq(trips.vehicleId, id), isNull(trips.deletedAt), gte(trips.date, `${y}-01-01`), lte(trips.date, `${y}-12-31`)),
    });
    const tripKm = tripRows.reduce((s, t) => s + t.km, 0);
    const tripCents = tripRows.reduce((s, t) => s + (tripAmountCents(t.km, calc.result) ?? 0), 0);
    years.push({
      year: y, yearId: calc.yearId, method: vy!.method, estimatedKm: vy!.estimatedKm, result: calc.result,
      tripCount: tripRows.length, tripKm, tripCents,
      receiptCount: (ctx.byTarget.get(`vehicle_year:${calc.yearId}`) ?? []).length,
    });
  }
  return {
    vehicle,
    odometer,
    costs: costs.map((c) => ({ ...c, receiptCount: (ctx.byTarget.get(`vehicle_cost:${c.id}`) ?? []).length })),
    years,
  };
}

export async function getVehicleCostAction(id: string) {
  await requireUser();
  return db.query.vehicleCosts.findFirst({ where: and(eq(vehicleCosts.id, id), isNull(vehicleCosts.deletedAt)), with: { vehicle: true } });
}

export async function getTripFormDataAction() {
  await requireUser();
  const [vehicleList, propertyList, routes] = await Promise.all([
    db.query.vehicles.findMany({ where: isNull(vehicles.deletedAt), orderBy: (v, { desc }) => [desc(v.inUseFrom)] }),
    db.query.properties.findMany({ where: isNull(properties.deletedAt), orderBy: (p, { asc }) => [asc(p.city)] }),
    db.query.tripRoutes.findMany({ where: isNull(tripRoutes.deletedAt), orderBy: (r, { asc }) => [asc(r.name)] }),
  ]);
  return {
    vehicles: vehicleList.map((v) => ({ id: v.id, name: v.name, inUseFrom: v.inUseFrom, inUseTo: v.inUseTo })),
    properties: propertyList.map((p) => ({ id: p.id, label: `${p.street}, ${p.city}` })),
    routes: routes.map((r) => ({ id: r.id, name: r.name, route: r.route, km: r.km, propertyId: r.propertyId })),
  };
}

export async function getTripAction(id: string) {
  await requireUser();
  return db.query.trips.findFirst({ where: and(eq(trips.id, id), isNull(trips.deletedAt)) });
}

// Zuletzt erfasste Fahrt (Vorschlag für Strecke, km und Objekt einer neuen Fahrt)
export async function getLastTripAction() {
  await requireUser();
  return db.query.trips.findFirst({ where: isNull(trips.deletedAt), orderBy: (t, { desc }) => [desc(t.date), desc(t.createdAt)] });
}

// Reiter „Fahrten": Fahrzeugjahre, Fahrten, Hinweise
export async function getTripsPageAction(year: number) {
  await requireUser();
  const today = todayLocal();
  const [vehicleList, tripRows, allTrips, ctx, form] = await Promise.all([
    db.query.vehicles.findMany({ where: isNull(vehicles.deletedAt) }),
    db.query.trips.findMany({
      where: and(isNull(trips.deletedAt), gte(trips.date, `${year}-01-01`), lte(trips.date, `${year}-12-31`)),
      with: { property: true, vehicle: true },
      orderBy: (t, { desc }) => [desc(t.date), desc(t.createdAt)],
    }),
    db.query.trips.findMany({ where: isNull(trips.deletedAt), columns: { date: true } }),
    loadReceiptContext(),
    getTripFormDataAction(),
  ]);

  const cards = [];
  for (const v of vehicleList) {
    if (!vehicleYearsInUse(v, today).includes(year) && !tripRows.some((t) => t.vehicleId === v.id)) continue;
    const calc = await computeVehicleYearFor(v.id, year);
    if (!calc) continue;
    const own = tripRows.filter((t) => t.vehicleId === v.id);
    const tripKm = own.reduce((s, t) => s + t.km, 0);
    cards.push({
      vehicle: v,
      yearId: calc.yearId,
      result: calc.result,
      tripCount: own.length,
      tripKm,
      tripCents: own.reduce((s, t) => s + (tripAmountCents(t.km, calc.result) ?? 0), 0),
      receiptCount: (ctx.byTarget.get(`vehicle_year:${calc.yearId}`) ?? []).length,
    });
  }

  const rateByVehicle = new Map(cards.map((c) => [c.vehicle.id, c.result]));
  const list = tripRows.map((t) => {
    const r = rateByVehicle.get(t.vehicleId);
    const cents = r ? tripAmountCents(t.km, r) ?? 0 : 0;
    return {
      id: t.id, date: t.date, route: t.route, km: t.km, purpose: t.purpose, cents,
      property: `${t.property.street}, ${t.property.city}`, propertyId: t.propertyId,
      vehicle: t.vehicle.name, expenseId: t.expenseId,
    };
  });

  const years = [...new Set([...allTrips.map((t) => +t.date.slice(0, 4)), +today.slice(0, 4)])].sort((a, b) => b - a);
  const propertyLabel = new Map(form.properties.map((p) => [p.id, p.label]));
  const frequent = frequentDestinations(tripRows).map((f) => ({ ...f, label: propertyLabel.get(f.propertyId) ?? "" }));
  const vehiclesSorted = [...vehicleList].sort((a, b) => b.inUseFrom.localeCompare(a.inUseFrom));
  return { cards, trips: list, years, routes: form.routes, properties: form.properties, frequent, vehicles: vehiclesSorted };
}
