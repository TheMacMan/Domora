"use server";

import { createId } from "@paralleldrive/cuid2";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  appSettings, documents, electricitySettlements, expenses, leases, meterReadings, meters, paymentReceipts, properties,
  supplyPrices, units,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { todayLocal } from "@/lib/dates";
import { PURPOSE_CATEGORY, PURPOSE_LABEL, addDays, type BillingLine } from "@/lib/meter-billing";
import {
  meterReadingSchema, meterSchema, settlementSchema, supplyPriceSchema,
  type MeterInput, type MeterReadingInput, type SettlementInput, type SupplyPriceInput,
} from "@/lib/validators/meter";
import { createDocumentLink } from "@/server/receipt-links";
import { planSettlement, tenantNames } from "@/server/meter-settlement";

type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateMeterViews(propertyId: string) {
  revalidatePath(`/properties/${propertyId}/meters`);
  revalidatePath("/dashboard");
  revalidatePath("/expenses", "layout");
  revalidatePath("/tax", "layout");
  revalidatePath("/payments", "layout");
}

async function unitOfProperty(unitId: string) {
  return db.query.units.findFirst({ where: and(eq(units.id, unitId), isNull(units.deletedAt)) });
}

// ── Zähler ───────────────────────────────────────────────────────────────────

function meterDb(d: MeterInput) {
  return {
    name: d.name, meterNumber: d.meterNumber || null, kind: d.kind, purpose: d.purpose, hostUnitId: d.hostUnitId,
    unitId: d.purpose === "unit" ? d.unitId : null,
    estimateKwhPerYear: d.kind === "estimate" ? d.estimateKwhPerYear : null,
    estimateNote: d.kind === "estimate" ? d.estimateNote || null : null,
    calibrationUntil: d.calibrationUntil || null, notes: d.notes || null,
  };
}

export async function createMeterAction(propertyId: string, data: MeterInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = meterSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const host = await unitOfProperty(parsed.data.hostUnitId);
  if (!host || host.propertyId !== propertyId) return { ok: false, error: "Wohnung gehört nicht zum Objekt." };
  const id = createId();
  await db.insert(meters).values({ id, propertyId, ...meterDb(parsed.data) });
  await writeAuditLog({ userId: user.id, action: "meter.create", entity: "meter", entityId: id, after: parsed.data });
  revalidateMeterViews(propertyId);
  return { ok: true };
}

export async function updateMeterAction(id: string, data: MeterInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = meterSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const before = await db.query.meters.findFirst({ where: and(eq(meters.id, id), isNull(meters.deletedAt)) });
  if (!before) return { ok: false, error: "Zähler nicht gefunden." };
  await db.update(meters).set({ ...meterDb(parsed.data), updatedAt: new Date() }).where(eq(meters.id, id));
  await writeAuditLog({ userId: user.id, action: "meter.update", entity: "meter", entityId: id, before: before as Record<string, unknown>, after: parsed.data });
  revalidateMeterViews(before.propertyId);
  return { ok: true };
}

export async function deleteMeterAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const before = await db.query.meters.findFirst({ where: and(eq(meters.id, id), isNull(meters.deletedAt)) });
  if (!before) return { ok: false, error: "Zähler nicht gefunden." };
  await db.update(meters).set({ deletedAt: new Date() }).where(eq(meters.id, id));
  await writeAuditLog({ userId: user.id, action: "meter.delete", entity: "meter", entityId: id, before: before as Record<string, unknown> });
  revalidateMeterViews(before.propertyId);
  return { ok: true };
}

// ── Zählerstände ─────────────────────────────────────────────────────────────

export async function addMeterReadingAction(meterId: string, data: MeterReadingInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = meterReadingSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const m = await db.query.meters.findFirst({ where: and(eq(meters.id, meterId), isNull(meters.deletedAt)), with: { readings: true } });
  if (!m) return { ok: false, error: "Zähler nicht gefunden." };
  if (m.kind !== "meter") return { ok: false, error: "Für geschätzte Verbräuche gibt es keine Zählerstände." };
  // Plausibilität: Stand darf nicht kleiner als ein früherer bzw. größer als ein späterer sein
  const active = m.readings.filter((r) => r.deletedAt == null);
  const before = active.filter((r) => r.date < parsed.data.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const after = active.filter((r) => r.date > parsed.data.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (active.some((r) => r.date === parsed.data.date)) return { ok: false, error: "Für dieses Datum gibt es schon einen Zählerstand." };
  if (before && parsed.data.value < before.value) return { ok: false, error: `Stand kleiner als am ${before.date.split("-").reverse().join(".")} (${before.value}).` };
  if (after && parsed.data.value > after.value) return { ok: false, error: `Stand größer als am ${after.date.split("-").reverse().join(".")} (${after.value}).` };
  const id = createId();
  await db.insert(meterReadings).values({ id, meterId, ...parsed.data, note: parsed.data.note || null });
  await writeAuditLog({ userId: user.id, action: "meter.reading.create", entity: "meter", entityId: meterId, after: { id, ...parsed.data } });
  revalidateMeterViews(m.propertyId);
  return { ok: true, id };
}

export async function deleteMeterReadingAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.query.meterReadings.findFirst({ where: and(eq(meterReadings.id, id), isNull(meterReadings.deletedAt)), with: { meter: true } });
  if (!r) return { ok: false, error: "Zählerstand nicht gefunden." };
  await db.update(meterReadings).set({ deletedAt: new Date() }).where(eq(meterReadings.id, id));
  await writeAuditLog({ userId: user.id, action: "meter.reading.delete", entity: "meter", entityId: r.meterId, before: r as unknown as Record<string, unknown> });
  revalidateMeterViews(r.meter.propertyId);
  return { ok: true };
}

// ── Strompreise (Arbeitspreis des Mieters) ───────────────────────────────────

export async function addSupplyPriceAction(data: SupplyPriceInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = supplyPriceSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const lease = await db.query.leases.findFirst({ where: and(eq(leases.id, parsed.data.leaseId), isNull(leases.deletedAt)), with: { unit: true } });
  if (!lease) return { ok: false, error: "Mietvertrag nicht gefunden." };
  const id = createId();
  await db.insert(supplyPrices).values({ id, ...parsed.data, note: parsed.data.note || null });
  await writeAuditLog({ userId: user.id, action: "supply_price.create", entity: "lease", entityId: lease.id, after: { id, ...parsed.data } });
  revalidateMeterViews(lease.unit.propertyId);
  return { ok: true };
}

export async function deleteSupplyPriceAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await db.query.supplyPrices.findFirst({ where: and(eq(supplyPrices.id, id), isNull(supplyPrices.deletedAt)), with: { lease: { with: { unit: true } } } });
  if (!p) return { ok: false, error: "Preis nicht gefunden." };
  await db.update(supplyPrices).set({ deletedAt: new Date() }).where(eq(supplyPrices.id, id));
  await writeAuditLog({ userId: user.id, action: "supply_price.delete", entity: "lease", entityId: p.leaseId, before: p as unknown as Record<string, unknown> });
  revalidateMeterViews(p.lease.unit.propertyId);
  return { ok: true };
}

// ── Abrechnungen ─────────────────────────────────────────────────────────────

export type SettlementPreview =
  | { ok: true; recipient: string; unit: string; lines: BillingLine[]; kwh: number; cents: number }
  | { ok: false; error: string };

export async function previewSettlementAction(data: SettlementInput): Promise<SettlementPreview> {
  await requireUser();
  const parsed = settlementSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const plan = await planSettlement(parsed.data);
  if ("error" in plan) return { ok: false, error: plan.error };
  if (!plan.billing.ok) return { ok: false, error: plan.billing.error };
  return { ok: true, recipient: tenantNames(plan.lease), unit: plan.lease.unit.name, lines: plan.billing.lines, kwh: plan.billing.kwh, cents: plan.billing.cents };
}

async function nextNumber(year: string) {
  const rows = await db.query.electricitySettlements.findMany({ where: like(electricitySettlements.number, `STROM-${year}-%`) });
  return `STROM-${year}-${String(rows.length + 1).padStart(3, "0")}`;
}

export async function createSettlementAction(data: SettlementInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = settlementSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const plan = await planSettlement(parsed.data);
  if ("error" in plan) return { ok: false, error: plan.error };
  if (!plan.billing.ok) return { ok: false, error: plan.billing.error };
  const { lease, billing } = plan;
  const property = lease.unit.property;

  // Überschneidung mit einer bestehenden Abrechnung gleicher Art für diesen Vertrag verhindern
  const existing = await db.query.electricitySettlements.findMany({
    where: and(eq(electricitySettlements.leaseId, lease.id), eq(electricitySettlements.direction, parsed.data.direction), isNull(electricitySettlements.deletedAt)),
  });
  const clash = existing.find((e) => e.periodStart < parsed.data.periodEnd && parsed.data.periodStart < e.periodEnd);
  if (clash) return { ok: false, error: `Zeitraum überschneidet sich mit ${clash.number}.` };

  const today = todayLocal();
  const number = await nextNumber(today.slice(0, 4));
  const settings = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  const meterRows = await db.query.meters.findMany({ where: inArray(meters.id, [...new Set(billing.lines.map((l) => l.meterId))]) });

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ElectricitySettlementPdf } = await import("@/lib/pdf/electricity-settlement-pdf");
  const buffer = await renderToBuffer(ElectricitySettlementPdf({
    data: {
      direction: parsed.data.direction, number, date: today,
      landlord: {
        name: settings?.landlordName ?? "",
        address: [settings?.landlordAddress, [settings?.landlordPostalCode, settings?.landlordCity].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        iban: settings?.landlordIban ?? null, bank: settings?.landlordBank ?? null,
      },
      recipient: { names: tenantNames(lease), unit: lease.unit.name, address: `${property.street}, ${property.postalCode} ${property.city}` },
      periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd,
      lines: billing.lines, kwh: billing.kwh, cents: billing.cents,
      estimateNotes: meterRows.filter((m) => m.kind === "estimate").map((m) => `${m.name}: ${m.estimateKwhPerYear} kWh/Jahr${m.estimateNote ? ` (${m.estimateNote})` : ""}`),
    },
  }));

  // PDF beim Mietvertrag ablegen (personenbezogen)
  const docId = createId();
  const dir = path.join(process.cwd(), "data", "uploads", "lease", lease.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${docId}.pdf`), new Uint8Array(buffer));
  const title = `${parsed.data.direction === "refund" ? "Stromerstattung" : "Stromabrechnung"} ${number} – ${lease.unit.name}`;
  await db.insert(documents).values({
    id: docId, filename: `${number}.pdf`, storedName: `${docId}.pdf`, mimeType: "application/pdf", sizeBytes: buffer.length,
    entityType: "lease", entityId: lease.id, tag: "Abrechnungen an Mieter", year: +parsed.data.periodEnd.slice(0, 4), title,
  });

  const id = createId();
  await db.insert(electricitySettlements).values({
    id, propertyId: property.id, direction: parsed.data.direction, leaseId: lease.id,
    periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd,
    kwh: billing.kwh, amountCents: billing.cents, linesJson: JSON.stringify(billing.lines), number, documentId: docId,
  });
  await writeAuditLog({ userId: user.id, action: "electricity_settlement.create", entity: "electricity_settlement", entityId: id, after: { number, ...parsed.data, cents: billing.cents } });
  revalidateMeterViews(property.id);
  revalidatePath("/documents");
  return { ok: true };
}

// Bezahlt: erst jetzt entstehen die Buchungen (Zufluss-/Abflussprinzip)
export async function markSettlementPaidAction(id: string, paidAt: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return { ok: false, error: "Ungültiges Datum." };
  const st = await db.query.electricitySettlements.findFirst({
    where: and(eq(electricitySettlements.id, id), isNull(electricitySettlements.deletedAt)),
    with: { lease: { with: { unit: true, leaseTenants: { with: { tenant: true } } } } },
  });
  if (!st) return { ok: false, error: "Abrechnung nicht gefunden." };
  if (st.status === "paid") return { ok: false, error: "Bereits als bezahlt markiert." };
  const lines = JSON.parse(st.linesJson) as BillingLine[];
  const names = tenantNames(st.lease);

  if (st.direction === "refund") {
    const byPurpose = new Map<BillingLine["purpose"], BillingLine[]>();
    for (const l of lines) byPurpose.set(l.purpose, [...(byPurpose.get(l.purpose) ?? []), l]);
    for (const [purpose, ls] of byPurpose) {
      const cents = ls.reduce((s, l) => s + l.cents, 0);
      if (cents === 0) continue;
      const expId = createId();
      await db.insert(expenses).values({
        id: expId, propertyId: st.propertyId, category: PURPOSE_CATEGORY[purpose], amountCents: cents, date: paidAt,
        description: `${PURPOSE_LABEL[purpose]} (Zwischenzähler) – Erstattung an ${names}`,
        notes: `${st.number} · ${[...new Set(ls.map((l) => l.meterName))].join(", ")} · ${ls.reduce((s, l) => s + l.kwh, 0).toLocaleString("de-DE")} kWh`,
        servicePeriodStart: st.periodStart, servicePeriodEnd: addDays(st.periodEnd, -1),
        electricitySettlementId: st.id,
        // Wohnungsstrom wird direkt mit dem Verbraucher abgerechnet → nicht in die NK-Umlage
        nkExclude: purpose === "unit",
      });
      if (st.documentId) await createDocumentLink(user.id, st.documentId, "expense", expId);
    }
  } else {
    await db.insert(paymentReceipts).values({
      id: createId(), leaseId: st.leaseId, kind: "utility", settlementYear: +st.periodEnd.slice(0, 4),
      receivedAt: paidAt, amountCents: st.amountCents, note: `Strom nach Verbrauch ${st.number}`,
    });
  }
  await db.update(electricitySettlements).set({ status: "paid", paidAt }).where(eq(electricitySettlements.id, id));
  await writeAuditLog({ userId: user.id, action: "electricity_settlement.paid", entity: "electricity_settlement", entityId: id, after: { paidAt } });
  revalidateMeterViews(st.propertyId);
  return { ok: true };
}

// Entfernen: Buchungen bzw. Zahlungseingang werden mit entfernt, das PDF bleibt archiviert
export async function deleteSettlementAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const st = await db.query.electricitySettlements.findFirst({ where: and(eq(electricitySettlements.id, id), isNull(electricitySettlements.deletedAt)) });
  if (!st) return { ok: false, error: "Abrechnung nicht gefunden." };
  const now = new Date();
  await db.update(expenses).set({ deletedAt: now }).where(and(eq(expenses.electricitySettlementId, id), isNull(expenses.deletedAt)));
  await db.update(paymentReceipts).set({ deletedAt: now }).where(and(eq(paymentReceipts.leaseId, st.leaseId), eq(paymentReceipts.kind, "utility"), like(paymentReceipts.note, `%${st.number}`), isNull(paymentReceipts.deletedAt)));
  await db.update(electricitySettlements).set({ deletedAt: now }).where(eq(electricitySettlements.id, id));
  await writeAuditLog({ userId: user.id, action: "electricity_settlement.delete", entity: "electricity_settlement", entityId: id, before: st as unknown as Record<string, unknown> });
  revalidateMeterViews(st.propertyId);
  return { ok: true };
}

// ── Lesen ────────────────────────────────────────────────────────────────────

export async function getMetersPageAction(propertyId: string) {
  await requireUser();
  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, propertyId), isNull(properties.deletedAt)),
    with: { units: { where: (u, { isNull: nul }) => nul(u.deletedAt), orderBy: (u, { asc }) => [asc(u.floor), asc(u.name)] } },
  });
  if (!property) return null;
  const unitIds = property.units.map((u) => u.id);
  const [meterRows, leaseRows, priceRows, settlementRows] = await Promise.all([
    db.query.meters.findMany({
      where: and(eq(meters.propertyId, propertyId), isNull(meters.deletedAt)),
      with: { readings: { where: (r, { isNull: nul }) => nul(r.deletedAt), orderBy: (r, { desc: d }) => [d(r.date)] }, hostUnit: true, unit: true },
      orderBy: (m, { asc }) => [asc(m.name)],
    }),
    unitIds.length ? db.query.leases.findMany({
      where: and(inArray(leases.unitId, unitIds), isNull(leases.deletedAt)),
      with: { unit: true, leaseTenants: { with: { tenant: true } } },
      orderBy: (l, { desc: d }) => [d(l.startDate)],
    }) : [],
    db.query.supplyPrices.findMany({ where: isNull(supplyPrices.deletedAt), orderBy: (p, { desc: d }) => [d(p.validFrom)] }),
    db.query.electricitySettlements.findMany({
      where: and(eq(electricitySettlements.propertyId, propertyId), isNull(electricitySettlements.deletedAt)),
      orderBy: [desc(electricitySettlements.periodEnd)],
    }),
  ]);

  const hostUnits = new Set(meterRows.map((m) => m.hostUnitId));
  const consumerUnits = new Set(meterRows.filter((m) => m.purpose === "unit" && m.unitId).map((m) => m.unitId!));
  const leaseLabel = (l: (typeof leaseRows)[number]) => `${tenantNames(l)} · ${l.unit.name}`;
  const today = todayLocal();
  const lastEnd = (leaseId: string, dir: "refund" | "charge") =>
    settlementRows.filter((s) => s.leaseId === leaseId && s.direction === dir).map((s) => s.periodEnd).sort().at(-1);

  // Mögliche Abrechnungen mit vorgeschlagenem Zeitraum (ab letzter Abrechnung bzw. Mietbeginn)
  const targets = leaseRows.flatMap((l) => {
    const out: Array<{ direction: "refund" | "charge"; leaseId: string; label: string; start: string; end: string }> = [];
    const end = l.endDate && l.endDate < today ? addDays(l.endDate, 1) : today;
    if (hostUnits.has(l.unitId)) out.push({ direction: "refund", leaseId: l.id, label: `Erstattung an ${leaseLabel(l)}`, start: lastEnd(l.id, "refund") ?? l.startDate, end });
    if (consumerUnits.has(l.unitId)) out.push({ direction: "charge", leaseId: l.id, label: `Rechnung an ${leaseLabel(l)}`, start: lastEnd(l.id, "charge") ?? l.startDate, end });
    return out.filter((t) => t.start < t.end);
  });

  const leaseById = new Map(leaseRows.map((l) => [l.id, l]));
  return {
    property: { id: property.id, street: property.street, city: property.city },
    units: property.units.map((u) => ({ id: u.id, name: u.name })),
    meters: meterRows.map((m) => ({
      ...m,
      consumptionByYear: consumptionByYear(m.readings),
    })),
    hostLeases: leaseRows.filter((l) => hostUnits.has(l.unitId)).map((l) => ({
      id: l.id, label: leaseLabel(l), startDate: l.startDate, endDate: l.endDate,
      prices: priceRows.filter((p) => p.leaseId === l.id),
    })),
    settlements: settlementRows.map((s) => ({ ...s, recipient: leaseById.get(s.leaseId) ? leaseLabel(leaseById.get(s.leaseId)!) : "" })),
    targets,
  };
}

// kWh je Kalenderjahr aus Ständen am Jahreswechsel (nur wenn beide vorhanden)
function consumptionByYear(readings: Array<{ date: string; value: number }>) {
  const byYear = new Map<number, number>();
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const y = +b.date.slice(0, 4) - (b.date.slice(5) === "01-01" ? 1 : 0);
    byYear.set(y, (byYear.get(y) ?? 0) + (b.value - a.value));
  }
  return [...byYear.entries()].sort((x, y) => y[0] - x[0]).map(([year, kwh]) => ({ year, kwh: Math.round(kwh * 10) / 10 }));
}

// Dashboard: offene Abrechnungen, fehlende Preise, fehlende Jahresablesung, Eichfrist
export async function getMeterTasksDataAction() {
  await requireUser();
  const today = todayLocal();
  const [open, meterRows, activeLeases, prices] = await Promise.all([
    db.query.electricitySettlements.findMany({
      where: and(eq(electricitySettlements.status, "open"), isNull(electricitySettlements.deletedAt)),
      with: { lease: { with: { leaseTenants: { with: { tenant: true } } } } },
    }),
    db.query.meters.findMany({ where: isNull(meters.deletedAt), with: { readings: { where: (r, { isNull: nul }) => nul(r.deletedAt) }, hostUnit: true } }),
    db.query.leases.findMany({ where: isNull(leases.deletedAt), with: { leaseTenants: { with: { tenant: true } }, unit: true } }),
    db.query.supplyPrices.findMany({ where: isNull(supplyPrices.deletedAt) }),
  ]);
  const hostUnits = new Set(meterRows.map((m) => m.hostUnitId));
  const missingPrices = activeLeases
    .filter((l) => hostUnits.has(l.unitId) && l.startDate <= today && (!l.endDate || l.endDate >= today) && !prices.some((p) => p.leaseId === l.id))
    .map((l) => ({ leaseId: l.id, propertyId: l.unit.propertyId, label: `${tenantNames(l)} · ${l.unit.name}` }));
  const year = +today.slice(0, 4);
  const lastDec = `${year - 1}-12-31`;
  const nearYearEnd = (d: string) => Math.abs(Date.parse(d) - Date.parse(lastDec)) <= 14 * 86_400_000;
  const missingYearEnd = meterRows
    // nur Zähler, die zum Jahreswechsel schon in Betrieb waren (Stand davor) bzw. noch gar keinen Stand haben
    .filter((m) => m.kind === "meter" && (m.readings.length === 0 || m.readings.some((r) => r.date < addDays(lastDec, -14))) && !m.readings.some((r) => nearYearEnd(r.date)))
    .map((m) => ({ meterId: m.id, propertyId: m.propertyId, name: m.name, year: year - 1 }));
  const calibration = meterRows
    .filter((m) => m.calibrationUntil && m.calibrationUntil <= addDays(today, 90))
    .map((m) => ({ propertyId: m.propertyId, name: m.name, until: m.calibrationUntil! }));
  return {
    openSettlements: open.map((s) => ({
      id: s.id, propertyId: s.propertyId, number: s.number, direction: s.direction, cents: s.amountCents,
      createdAt: s.createdAt.toISOString().slice(0, 10), recipient: tenantNames(s.lease),
    })),
    missingPrices,
    missingYearEnd,
    calibration,
  };
}
