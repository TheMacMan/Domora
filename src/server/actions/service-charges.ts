"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  nkAbrechnungen,
  nkAbrechnungLeases,
  nkAbrechnungPositionen,
  nkAbrechnungVacancy,
  units,
  leases,
  expenses,
  properties,
  rentAdjustments,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { OPERATING_COST_CATEGORIES, type ExpenseCategory } from "@/lib/expense";
import { DEFAULT_DISTRIBUTION_KEY, monthsActiveInYear, splitProportional } from "@/lib/nk-abrechnung";
import { effectiveRentAt } from "@/lib/rent";
import { expenseAmountInYear } from "@/lib/expense-distribution";

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

// Berechnet eine neue NK-Abrechnung im Status "draft" und schreibt sie in die DB.
// Bei Konflikten (es existiert bereits eine Abrechnung für Property + Jahr im Status draft/finalized)
// gibt es einen Fehler zurück.
export async function createNkAbrechnungAction(propertyId: string, year: number): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  if (!Number.isFinite(year) || year < 2000 || year > 2100) return { ok: false, error: "Ungültiges Jahr." };

  // Konflikt-Check
  const existing = await db.query.nkAbrechnungen.findFirst({
    where: and(eq(nkAbrechnungen.propertyId, propertyId), eq(nkAbrechnungen.year, year), isNull(nkAbrechnungen.deletedAt)),
  });
  if (existing) return { ok: false, error: `Für ${year} existiert bereits eine Abrechnung dieses Objekts.` };

  const property = await db.query.properties.findFirst({ where: and(eq(properties.id, propertyId), isNull(properties.deletedAt)) });
  if (!property) return { ok: false, error: "Objekt nicht gefunden." };

  // Wohneinheiten + aktive Leases im Jahr
  const allUnits = await db.query.units.findMany({
    where: and(eq(units.propertyId, propertyId), isNull(units.deletedAt)),
    with: {
      leases: { where: isNull(leases.deletedAt), with: { rentAdjustments: { where: isNull(rentAdjustments.deletedAt) } } },
    },
  });

  if (allUnits.length === 0) return { ok: false, error: "Keine Wohneinheiten am Objekt." };

  // Pro Unit: nur aktive Leases im Jahr (mindestens 1 Monat aktiv)
  type ActiveLease = { lease: typeof allUnits[number]["leases"][number]; unitId: string; months: number };
  const activeLeasesPerUnit: Array<{ unitId: string; livingArea: number; leases: ActiveLease[] }> = allUnits.map((u) => ({
    unitId: u.id,
    livingArea: u.livingArea,
    leases: u.leases
      .map((l) => ({ lease: l, unitId: u.id, months: monthsActiveInYear(l, year) }))
      .filter((x) => x.months > 0),
  }));

  // Ausgaben nach LEISTUNGSPRINZIP zuordnen:
  //   - Mit Leistungszeitraum: anteilige Monate im Abrechnungsjahr
  //   - Ohne Leistungszeitraum: Buchungsjahr
  // Wir laden alle Ausgaben und filtern in JS, weil Leistungszeiträume jahresübergreifend sein können.
  const allExpenses = await db.query.expenses.findMany({
    where: isNull(expenses.deletedAt),
  });
  // Anteilige Ausgaben aus "alle Objekte"-Buchungen (propertyId = null) gleichmäßig auf alle Properties verteilen
  const allPropertiesCount = (await db.query.properties.findMany({ where: isNull(properties.deletedAt) })).length;
  const propertyCount = Math.max(allPropertiesCount, 1);

  // Pro Kategorie Gesamtkosten — Betrag des Leistungsanteils im Abrechnungsjahr
  const categoryTotals = new Map<ExpenseCategory, number>();
  for (const e of allExpenses) {
    if (!(OPERATING_COST_CATEGORIES as string[]).includes(e.category)) continue;
    const inYear = expenseAmountInYear(e, year);
    if (inYear === 0) continue;
    let attributed: number;
    if (e.propertyId === propertyId) attributed = inYear;
    else if (e.propertyId === null) attributed = Math.round(inYear / propertyCount);
    else continue;
    const cat = e.category as ExpenseCategory;
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + attributed);
  }

  // Insert Abrechnung
  const abrId = createId();
  await db.insert(nkAbrechnungen).values({ id: abrId, propertyId, year, status: "draft" });

  // Pro aktivem Lease: Datensätze anlegen
  const leaseAbrechnungIds = new Map<string, string>(); // leaseId → leaseAbrechnungId

  for (const u of activeLeasesPerUnit) {
    for (const { lease, months } of u.leases) {
      const lAbrId = createId();
      leaseAbrechnungIds.set(lease.id, lAbrId);

      // Vorauszahlungen = Σ NK-Soll der aktiven Monate (Carry-Forward von Mietanpassungen)
      let vorauszahlungen = 0;
      for (let m = 1; m <= 12; m++) {
        const monthStart = `${year}-${String(m).padStart(2, "0")}-01`;
        const active = lease.startDate <= monthStart && (lease.endDate == null || lease.endDate >= monthStart);
        if (!active) continue;
        const { serviceChargesCents } = effectiveRentAt(lease, lease.rentAdjustments ?? [], monthStart);
        vorauszahlungen += serviceChargesCents ?? 0;
      }

      await db.insert(nkAbrechnungLeases).values({
        id: lAbrId,
        abrechnungId: abrId,
        leaseId: lease.id,
        unitId: u.unitId,
        monthsActive: months,
        kostenAnteilCents: 0,     // wird gleich gefüllt
        vorauszahlungenCents: vorauszahlungen,
        saldoCents: 0,
      });
    }
  }

  // Pro Kategorie: Verteilung über alle Units → dann zeitanteilig auf aktive Leases
  for (const [category, totalCents] of categoryTotals.entries()) {
    const key = DEFAULT_DISTRIBUTION_KEY[category];

    // Unit-Anteile berechnen
    type UnitShare = { unitId: string; livingArea: number; unitShareCents: number };
    let unitShares: UnitShare[];
    let basisLabelFn: (u: UnitShare) => string;

    if (key === "area") {
      const weights = activeLeasesPerUnit.map((u) => u.livingArea);
      const shares = splitProportional(totalCents, weights);
      const totalArea = weights.reduce((s, w) => s + w, 0);
      unitShares = activeLeasesPerUnit.map((u, i) => ({
        unitId: u.unitId,
        livingArea: u.livingArea,
        unitShareCents: shares[i] ?? 0,
      }));
      basisLabelFn = (u) =>
        `${u.livingArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m² von ${totalArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²`;
    } else if (key === "units") {
      const weights = activeLeasesPerUnit.map(() => 1);
      const shares = splitProportional(totalCents, weights);
      unitShares = activeLeasesPerUnit.map((u, i) => ({
        unitId: u.unitId,
        livingArea: u.livingArea,
        unitShareCents: shares[i] ?? 0,
      }));
      basisLabelFn = () => `1 von ${activeLeasesPerUnit.length} Einheiten`;
    } else {
      // consumption: vorerst gleichmäßig pro Einheit (User soll später manuell überschreiben)
      const weights = activeLeasesPerUnit.map(() => 1);
      const shares = splitProportional(totalCents, weights);
      unitShares = activeLeasesPerUnit.map((u, i) => ({
        unitId: u.unitId,
        livingArea: u.livingArea,
        unitShareCents: shares[i] ?? 0,
      }));
      basisLabelFn = () => `noch nicht erfasst (manuell eintragen)`;
    }

    // Pro Unit: weiter auf aktive Leases zeitanteilig — Leerstandsmonate als
    // impliziter weiterer Anteil, der NICHT den Mietern, sondern dem Vermieter
    // zugeordnet wird (BGH-Rechtsprechung, § 556a BGB).
    for (let i = 0; i < activeLeasesPerUnit.length; i++) {
      const u = activeLeasesPerUnit[i]!;
      const unitShare = unitShares[i]!;
      const leaseMonths = u.leases.map((al) => al.months);
      const sumLeaseMonths = leaseMonths.reduce((s, m) => s + m, 0);
      const vacantMonths = 12 - sumLeaseMonths;

      let leaseShares: number[];
      let vacancyShareCents = 0;
      if (vacantMonths > 0) {
        const weights = [...leaseMonths, vacantMonths];
        const shares = splitProportional(unitShare.unitShareCents, weights);
        leaseShares = shares.slice(0, leaseMonths.length);
        vacancyShareCents = shares[leaseMonths.length] ?? 0;
      } else {
        leaseShares = splitProportional(unitShare.unitShareCents, leaseMonths);
      }

      for (let j = 0; j < u.leases.length; j++) {
        const al = u.leases[j]!;
        const lAbrId = leaseAbrechnungIds.get(al.lease.id);
        if (!lAbrId) continue;
        await db.insert(nkAbrechnungPositionen).values({
          id: createId(),
          abrechnungId: abrId,
          leaseAbrechnungId: lAbrId,
          category,
          totalCostsCents: totalCents,
          distributionKey: key,
          basisLabel: basisLabelFn(unitShare) + ` · ${al.months}/12 Monate`,
          shareCents: leaseShares[j] ?? 0,
        });
      }

      if (vacantMonths > 0 && vacancyShareCents > 0) {
        await db.insert(nkAbrechnungVacancy).values({
          id: createId(),
          abrechnungId: abrId,
          unitId: u.unitId,
          category,
          vacantMonths,
          vacancyShareCents,
          basisLabel: `${basisLabelFn(unitShare)} · ${vacantMonths}/12 Monate Leerstand`,
        });
      }
    }
  }

  // Saldo + KostenAnteil aggregieren und schreiben
  const positions = await db.query.nkAbrechnungPositionen.findMany({ where: eq(nkAbrechnungPositionen.abrechnungId, abrId) });
  const sumByLease = new Map<string, number>();
  for (const p of positions) {
    sumByLease.set(p.leaseAbrechnungId, (sumByLease.get(p.leaseAbrechnungId) ?? 0) + p.shareCents);
  }
  for (const [lAbrId, summe] of sumByLease.entries()) {
    const row = await db.query.nkAbrechnungLeases.findFirst({ where: eq(nkAbrechnungLeases.id, lAbrId) });
    if (!row) continue;
    await db
      .update(nkAbrechnungLeases)
      .set({ kostenAnteilCents: summe, saldoCents: summe - row.vorauszahlungenCents })
      .where(eq(nkAbrechnungLeases.id, lAbrId));
  }

  await writeAuditLog({ userId: user.id, action: "nk_abrechnung.create", entity: "nk_abrechnung", entityId: abrId, after: { propertyId, year } });

  revalidatePath("/service-charges");
  return { ok: true, data: { id: abrId } };
}

export async function listNkAbrechnungenAction() {
  await requireUser();
  return db.query.nkAbrechnungen.findMany({
    where: isNull(nkAbrechnungen.deletedAt),
    orderBy: [desc(nkAbrechnungen.year), asc(nkAbrechnungen.createdAt)],
    with: {
      property: true,
      leaseAbrechnungen: { with: { lease: { with: { leaseTenants: { with: { tenant: true } } } }, unit: true } },
    },
  });
}

export async function getNkAbrechnungAction(id: string) {
  await requireUser();
  return db.query.nkAbrechnungen.findFirst({
    where: and(eq(nkAbrechnungen.id, id), isNull(nkAbrechnungen.deletedAt)),
    with: {
      property: true,
      leaseAbrechnungen: {
        with: {
          lease: { with: { leaseTenants: { with: { tenant: true } } } },
          unit: true,
          positionen: true,
        },
      },
      vacancy: {
        with: { unit: true },
      },
    },
  });
}

export async function deleteNkAbrechnungAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const row = await db.query.nkAbrechnungen.findFirst({ where: eq(nkAbrechnungen.id, id) });
  if (!row || row.deletedAt) return { ok: false, error: "Nicht gefunden." };
  await db.update(nkAbrechnungen).set({ deletedAt: new Date() }).where(eq(nkAbrechnungen.id, id));
  await writeAuditLog({ userId: user.id, action: "nk_abrechnung.delete", entity: "nk_abrechnung", entityId: id });
  revalidatePath("/service-charges");
  return { ok: true };
}

export async function finalizeNkAbrechnungAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const row = await db.query.nkAbrechnungen.findFirst({ where: eq(nkAbrechnungen.id, id) });
  if (!row || row.deletedAt) return { ok: false, error: "Nicht gefunden." };
  if (row.status === "finalized") return { ok: false, error: "Bereits finalisiert." };
  await db.update(nkAbrechnungen).set({ status: "finalized", updatedAt: new Date() }).where(eq(nkAbrechnungen.id, id));
  await writeAuditLog({ userId: user.id, action: "nk_abrechnung.finalize", entity: "nk_abrechnung", entityId: id });
  revalidatePath("/service-charges");
  revalidatePath(`/service-charges/${id}`);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────
// Phase 2: Bearbeiten, Neu berechnen, Entfinalisieren, Schlüssel ändern
// ────────────────────────────────────────────────────────────────────

import { DEFAULT_MIX_CONSUMPTION_PERMILLE } from "@/lib/nk-abrechnung";
import type { NkDistributionKey } from "@/db/schema";

// Aggregiert kostenAnteil + saldo aller Lease-Abrechnungen neu aus den positions.
async function recomputeAggregates(abrechnungId: string) {
  const positions = await db.query.nkAbrechnungPositionen.findMany({
    where: eq(nkAbrechnungPositionen.abrechnungId, abrechnungId),
  });
  const leaseRows = await db.query.nkAbrechnungLeases.findMany({
    where: eq(nkAbrechnungLeases.abrechnungId, abrechnungId),
  });
  const sumByLease = new Map<string, number>();
  for (const p of positions) {
    sumByLease.set(p.leaseAbrechnungId, (sumByLease.get(p.leaseAbrechnungId) ?? 0) + p.shareCents);
  }
  for (const row of leaseRows) {
    const summe = sumByLease.get(row.id) ?? 0;
    await db
      .update(nkAbrechnungLeases)
      .set({ kostenAnteilCents: summe, saldoCents: summe - row.vorauszahlungenCents })
      .where(eq(nkAbrechnungLeases.id, row.id));
  }
}

// Setzt eine NK-Abrechnung von "finalized" zurück auf "draft".
export async function unfinalizeNkAbrechnungAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const row = await db.query.nkAbrechnungen.findFirst({ where: eq(nkAbrechnungen.id, id) });
  if (!row || row.deletedAt) return { ok: false, error: "Nicht gefunden." };
  if (row.status === "draft") return { ok: false, error: "Bereits Entwurf." };
  await db.update(nkAbrechnungen).set({ status: "draft", updatedAt: new Date() }).where(eq(nkAbrechnungen.id, id));
  await writeAuditLog({ userId: user.id, action: "nk_abrechnung.unfinalize", entity: "nk_abrechnung", entityId: id });
  revalidatePath("/service-charges");
  revalidatePath(`/service-charges/${id}`);
  return { ok: true };
}

// Komplettes Neu-Berechnen einer NK-Abrechnung aus den aktuell erfassten Ausgaben.
// Erhält manuelle Verteilerschlüssel + Verbrauchswerte (Snapshot vor Löschung, Replay danach).
export async function recomputeNkAbrechnungAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const abr = await db.query.nkAbrechnungen.findFirst({
    where: and(eq(nkAbrechnungen.id, id), isNull(nkAbrechnungen.deletedAt)),
  });
  if (!abr) return { ok: false, error: "Nicht gefunden." };
  if (abr.status === "finalized") {
    return { ok: false, error: "Finalisierte Abrechnungen können nicht neu berechnet werden. Bitte erst entfinalisieren." };
  }

  const { propertyId, year } = abr;

  // Snapshot der manuellen Edits: keyed by (lease_id, category) → distribution config
  type Snapshot = {
    distributionKey: NkDistributionKey;
    mixConsumptionPermille: number | null;
    consumptionValue: number | null;
  };
  const oldLeases = await db.query.nkAbrechnungLeases.findMany({
    where: eq(nkAbrechnungLeases.abrechnungId, id),
  });
  const oldPositions = await db.query.nkAbrechnungPositionen.findMany({
    where: eq(nkAbrechnungPositionen.abrechnungId, id),
  });
  const leaseIdByOldAbrId = new Map(oldLeases.map((l) => [l.id, l.leaseId]));
  const snapshot = new Map<string, Snapshot>();
  for (const p of oldPositions) {
    if (!p.manualOverride) continue;
    const leaseId = leaseIdByOldAbrId.get(p.leaseAbrechnungId);
    if (!leaseId) continue;
    snapshot.set(`${leaseId}::${p.category}`, {
      distributionKey: p.distributionKey as NkDistributionKey,
      mixConsumptionPermille: p.mixConsumptionPermille,
      consumptionValue: p.consumptionValue,
    });
  }

  // Alte Abrechnung löschen
  await db.delete(nkAbrechnungVacancy).where(eq(nkAbrechnungVacancy.abrechnungId, id));
  await db.delete(nkAbrechnungPositionen).where(eq(nkAbrechnungPositionen.abrechnungId, id));
  await db.delete(nkAbrechnungLeases).where(eq(nkAbrechnungLeases.abrechnungId, id));
  await db.delete(nkAbrechnungen).where(eq(nkAbrechnungen.id, id));

  const res = await createNkAbrechnungAction(propertyId, year);
  if (!res.ok) return res;
  const newId = res.data!.id;

  // Snapshot pro Kategorie replayen: gruppiere snapshot-Einträge nach category, baue
  // consumptionPerLease aus dem lease_id-Mapping der neuen Abrechnung.
  if (snapshot.size > 0) {
    const newLeases = await db.query.nkAbrechnungLeases.findMany({
      where: eq(nkAbrechnungLeases.abrechnungId, newId),
    });
    const newLeaseAbrByLeaseId = new Map(newLeases.map((l) => [l.leaseId, l.id]));

    // Pro Kategorie sammeln
    type CatConfig = {
      distributionKey: NkDistributionKey;
      mixConsumptionPermille?: number;
      consumptionPerLease: Record<string, number>;
    };
    const byCategory = new Map<string, CatConfig>();
    for (const [key, snap] of snapshot.entries()) {
      const [leaseId, category] = key.split("::") as [string, string];
      const newLeaseAbrId = newLeaseAbrByLeaseId.get(leaseId);
      if (!newLeaseAbrId) continue; // Lease existiert in der neuen Abrechnung nicht mehr
      let cfg = byCategory.get(category);
      if (!cfg) {
        cfg = {
          distributionKey: snap.distributionKey,
          mixConsumptionPermille: snap.mixConsumptionPermille ?? undefined,
          consumptionPerLease: {},
        };
        byCategory.set(category, cfg);
      }
      if (snap.consumptionValue != null) {
        cfg.consumptionPerLease[newLeaseAbrId] = snap.consumptionValue;
      }
    }

    for (const [category, cfg] of byCategory.entries()) {
      await updateNkCategoryDistributionAction(newId, category as ExpenseCategory, cfg);
    }
  }

  await writeAuditLog({
    userId: user.id,
    action: "nk_abrechnung.recompute",
    entity: "nk_abrechnung",
    entityId: newId,
    after: { previousId: id, preservedEdits: snapshot.size },
  });
  return { ok: true, data: { id: newId } };
}

// Ändert den Verteilerschlüssel einer Kategorie und rechnet die Positions-Anteile neu.
// Bei "consumption" oder "mix" werden Verbrauchswerte pro Lease-Abrechnung mitgegeben.
export async function updateNkCategoryDistributionAction(
  abrechnungId: string,
  category: ExpenseCategory,
  config: {
    distributionKey: NkDistributionKey;
    mixConsumptionPermille?: number;
    consumptionPerLease?: Record<string, number>; // leaseAbrechnungId → Verbrauchswert
  },
): Promise<ActionResult> {
  const user = await requireUser();
  const abr = await db.query.nkAbrechnungen.findFirst({ where: and(eq(nkAbrechnungen.id, abrechnungId), isNull(nkAbrechnungen.deletedAt)) });
  if (!abr) return { ok: false, error: "Abrechnung nicht gefunden." };
  if (abr.status === "finalized") return { ok: false, error: "Finalisierte Abrechnungen können nicht bearbeitet werden." };

  // Lade alle Positionen dieser Kategorie + zugehörige Lease/Unit-Daten
  const positions = await db.query.nkAbrechnungPositionen.findMany({
    where: and(eq(nkAbrechnungPositionen.abrechnungId, abrechnungId), eq(nkAbrechnungPositionen.category, category)),
  });
  if (positions.length === 0) return { ok: false, error: "Keine Positionen für diese Kategorie." };

  const totalCostsCents = positions[0]!.totalCostsCents; // alle Positionen einer Kategorie haben denselben Gesamtbetrag

  // Lease-Abrechnungen für Unit-/Monatszuordnung
  const leaseAbrs = await db.query.nkAbrechnungLeases.findMany({
    where: eq(nkAbrechnungLeases.abrechnungId, abrechnungId),
    with: { unit: true },
  });

  // Alle Wohneinheiten des Objekts laden — auch ganzjährig leerstehende sollen
  // mit ihrem Anteil im Verteiler erscheinen (sonst stimmen Summe + Leerstand nicht).
  const propertyUnits = await db.query.units.findMany({
    where: and(eq(units.propertyId, abr.propertyId), isNull(units.deletedAt)),
  });

  // Pro Wohneinheit aggregieren wir mehrere Lease-Perioden (Mieterwechsel).
  // Fully-vacant units bekommen leeres `leases`-Array.
  const byUnit = new Map<string, { livingArea: number; leases: typeof leaseAbrs }>();
  for (const u of propertyUnits) {
    byUnit.set(u.id, { livingArea: u.livingArea, leases: [] });
  }
  for (const la of leaseAbrs) {
    const e = byUnit.get(la.unitId);
    if (e) e.leases.push(la);
  }
  const unitEntries = Array.from(byUnit.entries());

  // Konsum-Werte pro Wohneinheit ableiten (Σ über alle Lease-Perioden derselben Unit)
  const consumptionPerUnit = new Map<string, number>();
  if (config.consumptionPerLease) {
    for (const [unitId, entry] of unitEntries) {
      let sum = 0;
      for (const la of entry.leases) sum += config.consumptionPerLease[la.id] ?? 0;
      consumptionPerUnit.set(unitId, sum);
    }
  }

  // Unit-Anteile berechnen
  type UnitShare = { unitId: string; livingArea: number; shareCents: number; basisLabel: string };
  let unitShares: UnitShare[];

  const totalArea = unitEntries.reduce((s, [, e]) => s + e.livingArea, 0);
  const fmtArea = (a: number) => a.toLocaleString("de-DE", { maximumFractionDigits: 2 });

  if (config.distributionKey === "area") {
    const weights = unitEntries.map(([, e]) => e.livingArea);
    const shares = splitProportional(totalCostsCents, weights);
    unitShares = unitEntries.map(([unitId, e], i) => ({
      unitId,
      livingArea: e.livingArea,
      shareCents: shares[i] ?? 0,
      basisLabel: `${fmtArea(e.livingArea)} m² von ${fmtArea(totalArea)} m²`,
    }));
  } else if (config.distributionKey === "units") {
    const weights = unitEntries.map(() => 1);
    const shares = splitProportional(totalCostsCents, weights);
    unitShares = unitEntries.map(([unitId, e], i) => ({
      unitId,
      livingArea: e.livingArea,
      shareCents: shares[i] ?? 0,
      basisLabel: `1 von ${unitEntries.length} Einheiten`,
    }));
  } else if (config.distributionKey === "consumption") {
    const weights = unitEntries.map(([unitId]) => consumptionPerUnit.get(unitId) ?? 0);
    const totalConsumption = weights.reduce((s, w) => s + w, 0);
    const shares = splitProportional(totalCostsCents, weights);
    unitShares = unitEntries.map(([unitId, e], i) => ({
      unitId,
      livingArea: e.livingArea,
      shareCents: shares[i] ?? 0,
      basisLabel: totalConsumption > 0
        ? `${(consumptionPerUnit.get(unitId) ?? 0).toLocaleString("de-DE")} von ${totalConsumption.toLocaleString("de-DE")}`
        : "0 von 0 (keine Werte)",
    }));
  } else {
    // mix
    const mixPermille = config.mixConsumptionPermille ?? DEFAULT_MIX_CONSUMPTION_PERMILLE;
    const consumptionShare = mixPermille / 1000;
    const consumptionCents = Math.round(totalCostsCents * consumptionShare);
    const areaCents = totalCostsCents - consumptionCents;

    const consWeights = unitEntries.map(([unitId]) => consumptionPerUnit.get(unitId) ?? 0);
    const areaWeights = unitEntries.map(([, e]) => e.livingArea);
    const consShares = splitProportional(consumptionCents, consWeights);
    const areaShares = splitProportional(areaCents, areaWeights);
    const totalConsumption = consWeights.reduce((s, w) => s + w, 0);

    unitShares = unitEntries.map(([unitId, e], i) => ({
      unitId,
      livingArea: e.livingArea,
      shareCents: (consShares[i] ?? 0) + (areaShares[i] ?? 0),
      basisLabel: totalConsumption > 0
        ? `${Math.round(mixPermille / 10)} % Verbrauch + ${Math.round((1 - consumptionShare) * 100)} % Fläche`
        : `${Math.round(mixPermille / 10)} % Verbrauch (keine Werte) + ${Math.round((1 - consumptionShare) * 100)} % Fläche`,
    }));
  }

  // Alte Vacancy-Einträge dieser Kategorie löschen — werden gleich neu geschrieben
  await db
    .delete(nkAbrechnungVacancy)
    .where(and(eq(nkAbrechnungVacancy.abrechnungId, abrechnungId), eq(nkAbrechnungVacancy.category, category)));

  // Pro Unit zeitanteilig auf Leases verteilen, Leerstandsmonate als Vermieteranteil
  for (let i = 0; i < unitEntries.length; i++) {
    const [unitId, entry] = unitEntries[i]!;
    const unitShare = unitShares[i]!;
    const leaseMonths = entry.leases.map((la) => la.monthsActive);
    const sumLeaseMonths = leaseMonths.reduce((s, m) => s + m, 0);
    const vacantMonths = 12 - sumLeaseMonths;

    let leaseShares: number[];
    let vacancyShareCents = 0;
    if (vacantMonths > 0) {
      const weights = [...leaseMonths, vacantMonths];
      const shares = splitProportional(unitShare.shareCents, weights);
      leaseShares = shares.slice(0, leaseMonths.length);
      vacancyShareCents = shares[leaseMonths.length] ?? 0;
    } else {
      leaseShares = splitProportional(unitShare.shareCents, leaseMonths);
    }

    for (let j = 0; j < entry.leases.length; j++) {
      const la = entry.leases[j]!;
      const lShareCents = leaseShares[j] ?? 0;
      // Finde existierende Position dieser Kategorie für dieses Lease
      const existingPos = positions.find((p) => p.leaseAbrechnungId === la.id);
      if (!existingPos) continue;
      const consVal = config.consumptionPerLease?.[la.id] ?? null;
      await db
        .update(nkAbrechnungPositionen)
        .set({
          distributionKey: config.distributionKey,
          shareCents: lShareCents,
          basisLabel: `${unitShare.basisLabel} · ${la.monthsActive}/12 Monate`,
          consumptionValue: consVal,
          mixConsumptionPermille: config.distributionKey === "mix" ? (config.mixConsumptionPermille ?? DEFAULT_MIX_CONSUMPTION_PERMILLE) : null,
          manualOverride: true,
        })
        .where(eq(nkAbrechnungPositionen.id, existingPos.id));
    }

    if (vacantMonths > 0 && vacancyShareCents > 0) {
      await db.insert(nkAbrechnungVacancy).values({
        id: createId(),
        abrechnungId,
        unitId,
        category,
        vacantMonths,
        vacancyShareCents,
        basisLabel: `${unitShare.basisLabel} · ${vacantMonths}/12 Monate Leerstand`,
      });
    }
  }

  await recomputeAggregates(abrechnungId);

  await writeAuditLog({
    userId: user.id,
    action: "nk_abrechnung.update_distribution",
    entity: "nk_abrechnung",
    entityId: abrechnungId,
    after: { category, distributionKey: config.distributionKey, mixConsumptionPermille: config.mixConsumptionPermille },
  });

  revalidatePath(`/service-charges/${abrechnungId}`);
  revalidatePath(`/service-charges/${abrechnungId}/edit`);
  revalidatePath("/service-charges");
  return { ok: true };
}
