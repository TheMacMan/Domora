"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vpiEntries, leases, appSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { todayLocal } from "@/lib/dates";

type ActionResult = { ok: true } | { ok: false; error: string };
type FetchResult = { ok: true; added: number; updated: number } | { ok: false; error: string };

// ── helpers ────────────────────────────────────────────────────────────────

// Parses the GENESIS-Online 2020 REST API response (datencsv format embedded in
// Object.Content). The CSV is semicolon-separated and looks like:
//   2020;Januar;99,8;+2,1;-0,2
//   2020;Februar;100,1;+2,0;+0,3
// We extract (year, monthName, indexValue) and emit YYYY-MM → value.
const MONTH_NAME_TO_NUM: Record<string, number> = {
  Januar: 1, Februar: 2, März: 3, April: 4, Mai: 5, Juni: 6,
  Juli: 7, August: 8, September: 9, Oktober: 10, November: 11, Dezember: 12,
};
function extractVpiPoints(csvBlob: string): Array<{ yearMonth: string; value: number }> {
  const results: Array<{ yearMonth: string; value: number }> = [];
  for (const line of csvBlob.split(/\r?\n/)) {
    const cols = line.split(";");
    if (cols.length < 3) continue;
    const year = parseInt(cols[0] ?? "", 10);
    if (!Number.isFinite(year) || year < 1990 || year > 2100) continue;
    const month = MONTH_NAME_TO_NUM[(cols[1] ?? "").trim()];
    if (!month) continue;
    const raw = (cols[2] ?? "").trim().replace(",", ".");
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    results.push({ yearMonth: `${year}-${String(month).padStart(2, "0")}`, value });
  }
  return results;
}

// ── actions ────────────────────────────────────────────────────────────────

export async function getVpiEntriesAction() {
  await requireUser();
  return db.query.vpiEntries.findMany({
    orderBy: (v, { asc }) => [asc(v.yearMonth)],
  });
}

export async function getIndexLeasesAction() {
  await requireUser();
  return db.query.leases.findMany({
    where: and(eq(leases.rentType, "index"), isNull(leases.deletedAt)),
    with: {
      leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
      rentAdjustments: {
        where: (r, { isNull }) => isNull(r.deletedAt),
        orderBy: (r, { asc }) => [asc(r.effectiveDate)],
      },
    },
  });
}

// VPI-Erhöhungspotential pro Index-Mietvertrag
// Vergleicht den VPI zum Zeitpunkt der letzten Mietanpassung (oder Vertragsbeginn)
// mit dem jüngsten verfügbaren VPI-Wert und ermittelt das § 557b BGB-Potential.

export type IndexLeasePotential = {
  leaseId: string;
  unitName: string;
  propertyLabel: string;          // "Straße, Stadt"
  tenantsLabel: string;            // "Schäfer, Carsten · ..."
  referenceLabel: string;          // "Vertragsbeginn" | "Anpassung"
  referenceDate: string;           // YYYY-MM-DD
  referenceYearMonth: string;      // YYYY-MM (tatsächlich verwendeter VPI-Monat)
  referenceVpi: number | null;     // null wenn kein VPI-Wert verfügbar
  currentYearMonth: string | null; // YYYY-MM des jüngsten VPI-Werts
  currentVpi: number | null;
  changePercent: number | null;    // z.B. 1.47
  currentRentCents: number;
  potentialRentCents: number | null;
  potentialDeltaCents: number | null;
  blockedUntil: string | null;     // YYYY-MM-DD: Sperrfrist § 557b (12 Monate)
  blocked: boolean;                // heute < blockedUntil
  // Geplante (künftige) Mieterhöhung — falls bereits eingepflegt
  plannedAdjustmentDate: string | null;
  plannedAdjustmentRentCents: number | null;
  plannedAdjustmentDeltaCents: number | null;
  // Sparkline: VPI-Verlauf seit Referenzmonat
  vpiSeries: Array<{ yearMonth: string; value: number }>;
};

export async function getIndexLeasePotentialAction(): Promise<IndexLeasePotential[]> {
  await requireUser();
  const today = todayLocal();
  const todayYM = today.slice(0, 7);

  const [indexLeases, allVpi] = await Promise.all([
    db.query.leases.findMany({
      where: and(eq(leases.rentType, "index"), isNull(leases.deletedAt)),
      with: {
        unit: { with: { property: true } },
        leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
        rentAdjustments: {
          where: (r, { isNull }) => isNull(r.deletedAt),
          orderBy: (r, { asc }) => [asc(r.effectiveDate)],
        },
      },
    }),
    db.query.vpiEntries.findMany({ orderBy: (v, { asc }) => [asc(v.yearMonth)] }),
  ]);

  // Map yearMonth → value, plus sortierte Liste für Fallback (jüngster Wert ≤ Referenz-Monat)
  const vpiMap = new Map(allVpi.map((v) => [v.yearMonth, v.value]));
  const vpiSorted = allVpi.map((v) => ({ ym: v.yearMonth, value: v.value }));
  // Jüngster VPI ≤ ym (Fallback wenn exakter Monat fehlt)
  function vpiAt(ym: string): { ym: string; value: number } | null {
    if (vpiMap.has(ym)) return { ym, value: vpiMap.get(ym)! };
    let best: { ym: string; value: number } | null = null;
    for (const e of vpiSorted) {
      if (e.ym <= ym && (!best || e.ym > best.ym)) best = e;
    }
    return best;
  }
  // Jüngster verfügbarer VPI insgesamt (i.d.R. nicht in der Zukunft)
  const latestVpi = vpiSorted.length > 0
    ? [...vpiSorted].reverse().find((e) => e.ym <= todayYM) ?? vpiSorted[vpiSorted.length - 1]!
    : null;

  const results: IndexLeasePotential[] = [];

  for (const lease of indexLeases) {
    // Beendete Verträge ausblenden
    if (lease.endDate && lease.endDate < today) continue;

    // Nur Anpassungen werten, die die Kaltmiete tatsächlich ändern.
    const rentAdj = rentChangingAdjustments(lease.rentCents, lease.rentAdjustments);

    // Heute gezahlte Kaltmiete (jüngste vergangene Anpassung, sonst Initial).
    const pastAdjustments = rentAdj.filter((a) => a.effectiveDate <= today);
    const lastPast = pastAdjustments.length > 0 ? pastAdjustments[pastAdjustments.length - 1]! : null;
    const currentRentCents = lastPast ? lastPast.rentCents : lease.rentCents;

    // Geplante künftige Anpassung (falls eingepflegt) — verschiebt Referenz und Sperrfrist.
    const futureAdjustments = rentAdj.filter((a) => a.effectiveDate > today);
    const plannedAdj = futureAdjustments.length > 0 ? futureAdjustments[futureAdjustments.length - 1]! : null;

    // Referenz für Sperrfrist + VPI-Vergleich + Berechnungs-Basis:
    // − ohne geplante Anpassung: letzte tatsächliche Anpassung bzw. Vertragsbeginn
    // − mit geplanter Anpassung: deren Datum & Miete (denn die nächste Erhöhung darf
    //   erst 12 Monate danach kommen, und Potential wird gegen die künftige Miete gerechnet)
    const referenceDate = plannedAdj
      ? plannedAdj.effectiveDate
      : (lastPast ? lastPast.effectiveDate : lease.startDate);
    const referenceLabel = plannedAdj
      ? "Geplante Anpassung"
      : (lastPast ? "Anpassung" : "Vertragsbeginn");
    const baselineRentCents = plannedAdj ? plannedAdj.rentCents : currentRentCents;
    const plannedDelta = plannedAdj ? plannedAdj.rentCents - currentRentCents : null;

    const refYM = referenceDate.slice(0, 7);
    const refVpi = vpiAt(refYM);
    const referenceVpi = refVpi?.value ?? null;
    const referenceYearMonth = refVpi?.ym ?? refYM;

    const currentVpi = latestVpi?.value ?? null;
    const currentYearMonth = latestVpi?.ym ?? null;

    const changePercent =
      referenceVpi != null && currentVpi != null && referenceVpi > 0
        ? ((currentVpi / referenceVpi) - 1) * 100
        : null;

    // Potential = baseline × (1 + VPI-Anstieg). baseline = heute gezahlte Miete oder,
    // bei eingeplanter Anpassung, die künftige Miete.
    const potentialRentCents =
      changePercent != null
        ? Math.round(baselineRentCents * (1 + changePercent / 100))
        : null;
    const potentialDeltaCents =
      potentialRentCents != null ? potentialRentCents - baselineRentCents : null;

    // § 557b BGB: 12 Monate seit Wirksamwerden der letzten Miete
    const refD = new Date(referenceDate + "T00:00:00");
    refD.setFullYear(refD.getFullYear() + 1);
    const blockedUntil = refD.toISOString().slice(0, 10);
    const blocked = today < blockedUntil;

    const tenantsLabel = lease.leaseTenants
      .map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`)
      .join(" · ");

    // Sparkline-Reihe: VPI-Werte von referenceYearMonth bis Ende der Daten
    const vpiSeries = vpiSorted
      .filter((e) => e.ym >= referenceYearMonth)
      .map((e) => ({ yearMonth: e.ym, value: e.value }));

    results.push({
      leaseId: lease.id,
      unitName: lease.unit.name,
      propertyLabel: `${lease.unit.property.street}, ${lease.unit.property.city}`,
      tenantsLabel,
      referenceLabel,
      referenceDate,
      referenceYearMonth,
      referenceVpi,
      currentYearMonth,
      currentVpi,
      changePercent,
      currentRentCents,
      potentialRentCents,
      potentialDeltaCents,
      blockedUntil,
      blocked,
      plannedAdjustmentDate: plannedAdj?.effectiveDate ?? null,
      plannedAdjustmentRentCents: plannedAdj?.rentCents ?? null,
      plannedAdjustmentDeltaCents: plannedDelta,
      vpiSeries,
    });
  }

  // Sortierung: nach % Anstieg absteigend, fehlende Werte ans Ende
  results.sort((a, b) => {
    if (a.changePercent == null && b.changePercent == null) return 0;
    if (a.changePercent == null) return 1;
    if (b.changePercent == null) return -1;
    return b.changePercent - a.changePercent;
  });

  return results;
}

// ── Erhöhungspotential für Fest- und Staffelmieten ────────────────────────

// Anpassung addiert n Jahre/Monate auf ein YYYY-MM-DD-Datum (lokales Datum).
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
// Volle Monate zwischen zwei Daten — auf Tagesbasis berechnet und gegen Null
// abgeschnitten. „Vom 15.05. bis 01.09." sind 3 (nicht 4) Monate.
function monthsBetween(fromStr: string, toStr: string): number {
  const f = new Date(fromStr + "T00:00:00");
  const t = new Date(toStr + "T00:00:00");
  const days = Math.round((t.getTime() - f.getTime()) / 86400000);
  return Math.trunc(days / 30.44);
}

export type FixedLeasePotential = {
  leaseId: string;
  unitName: string;
  propertyLabel: string;
  tenantsLabel: string;
  livingArea: number;
  // Aktuelle Miete / €-pro-m²
  currentRentCents: number;
  currentRentPerSqmCents: number;
  // Referenz: letzte Anpassung (oder Vertragsbeginn)
  referenceDate: string;          // YYYY-MM-DD
  referenceLabel: string;         // "Vertragsbeginn" | "Anpassung"
  monthsSinceReference: number;
  // Sperrfrist: 12 Monate seit Wirksamwerden der letzten Miete (§ 558 Abs. 1 BGB)
  blockedUntil: string;
  blocked: boolean;
  // Kappungsgrenze: Miete vor 3 Jahren × 1,20
  rentThreeYearsAgoCents: number;
  capLimitCents: number;          // Obergrenze nach Kappungsgrenze
  capHeadroomCents: number;       // capLimit − currentRent (kann 0 oder negativ sein)
  // Ortsübliche Vergleichsmiete (optional, aus property.referenceRentCentsPerSqm)
  referenceRentCentsPerSqm: number | null;
  targetRentCents: number | null;     // Vergleichsmiete × m²
  targetDeltaCents: number | null;    // targetRent − currentRent
  // Tatsächliches Potential = min(targetRent, capLimit) − currentRent
  potentialNewRentCents: number | null;
  potentialDeltaCents: number | null;
  // VPI-Drift (rein informativ)
  vpiDriftPercent: number | null;
  vpiNeutralRentCents: number | null;
  // Geplante (künftige) Mieterhöhung — falls bereits eingepflegt
  plannedAdjustmentDate: string | null;
  plannedAdjustmentRentCents: number | null;
  plannedAdjustmentDeltaCents: number | null;
  // Sparkline-Reihe: Treppenfunktion der eigenen Kaltmiete vom Vertragsbeginn
  // bis heute (vergangene Anpassungen). Künftige Anpassung als separate Spur.
  rentSeries: Array<{ date: string; rentCents: number }>;
  plannedRentPoint: { date: string; rentCents: number } | null;
  todayDate: string;
};

export type GraduatedLeaseNextStep = {
  leaseId: string;
  unitName: string;
  propertyLabel: string;
  tenantsLabel: string;
  livingArea: number;
  currentRentCents: number;
  currentRentPerSqmCents: number;
  // Nächste vereinbarte Staffel
  nextStepDate: string | null;        // YYYY-MM-DD, null = keine weitere
  nextStepRentCents: number | null;
  nextStepDeltaCents: number | null;
  nextStepPercent: number | null;
  monthsUntilNext: number | null;
  // Letzte (bereits wirksame) Anpassung
  lastStepDate: string;
  isFinalStep: boolean;               // keine weiteren Staffeln im Vertrag
  // Sparkline: alle Staffelstufen (Vergangenheit + Zukunft) als Treppe
  stepsSeries: Array<{ date: string; rentCents: number; future: boolean }>;
  todayDate: string;
};

// Filtert rent_adjustments auf solche, bei denen sich die Kaltmiete tatsächlich
// ändert. Anpassungen, die nur die Nebenkosten-Vorauszahlung betreffen, sind für
// Mieterhöhungs-Sperrfristen und Vergleichsmieten irrelevant.
// `adjustments` muss bereits aufsteigend nach effectiveDate sortiert sein.
function rentChangingAdjustments<T extends { rentCents: number }>(
  initialRentCents: number,
  adjustments: T[],
): T[] {
  const out: T[] = [];
  let prev = initialRentCents;
  for (const a of adjustments) {
    if (a.rentCents !== prev) {
      out.push(a);
      prev = a.rentCents;
    }
  }
  return out;
}

async function loadVpiMap() {
  const all = await db.query.vpiEntries.findMany({ orderBy: (v, { asc }) => [asc(v.yearMonth)] });
  const map = new Map(all.map((v) => [v.yearMonth, v.value]));
  const sorted = all.map((v) => ({ ym: v.yearMonth, value: v.value }));
  function at(ym: string): { ym: string; value: number } | null {
    if (map.has(ym)) return { ym, value: map.get(ym)! };
    let best: { ym: string; value: number } | null = null;
    for (const e of sorted) {
      if (e.ym <= ym && (!best || e.ym > best.ym)) best = e;
    }
    return best;
  }
  return { at, sorted };
}

export async function getFixedLeasePotentialAction(): Promise<FixedLeasePotential[]> {
  await requireUser();
  const today = todayLocal();
  const todayYM = today.slice(0, 7);

  const fixedLeases = await db.query.leases.findMany({
    where: and(eq(leases.rentType, "fixed"), isNull(leases.deletedAt)),
    with: {
      unit: { with: { property: true } },
      leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
      rentAdjustments: {
        where: (r, { isNull }) => isNull(r.deletedAt),
        orderBy: (r, { asc }) => [asc(r.effectiveDate)],
      },
    },
  });

  const { at: vpiAt, sorted: vpiSorted } = await loadVpiMap();
  const latestVpi = vpiSorted.length > 0
    ? [...vpiSorted].reverse().find((e) => e.ym <= todayYM) ?? vpiSorted[vpiSorted.length - 1]!
    : null;

  const out: FixedLeasePotential[] = [];

  for (const lease of fixedLeases) {
    if (lease.endDate && lease.endDate < today) continue;

    // Nur Anpassungen werten, die die Kaltmiete tatsächlich ändern.
    const rentAdj = rentChangingAdjustments(lease.rentCents, lease.rentAdjustments);
    const past = rentAdj.filter((a) => a.effectiveDate <= today);
    const future = rentAdj.filter((a) => a.effectiveDate > today);
    const lastPast = past.length > 0 ? past[past.length - 1]! : null;
    const plannedAdj = future.length > 0 ? future[future.length - 1]! : null;

    // Heute gezahlte Kaltmiete (für Anzeige)
    const currentRentCents = lastPast ? lastPast.rentCents : lease.rentCents;

    // Referenz für Sperrfrist + Berechnungs-Basis: künftige Anpassung priorisieren,
    // weil danach eine weitere Erhöhung erst nach 12 Monaten möglich ist
    // und die Berechnungsbasis dann die geplante Miete ist.
    const referenceDate = plannedAdj
      ? plannedAdj.effectiveDate
      : (lastPast ? lastPast.effectiveDate : lease.startDate);
    const referenceLabel = plannedAdj
      ? "Geplante Anpassung"
      : (lastPast ? "Anpassung" : "Vertragsbeginn");
    const baselineRentCents = plannedAdj ? plannedAdj.rentCents : currentRentCents;
    const plannedDelta = plannedAdj ? plannedAdj.rentCents - currentRentCents : null;

    const livingArea = lease.unit.livingArea;
    const currentRentPerSqmCents = livingArea > 0 ? Math.round(currentRentCents / livingArea) : 0;
    const monthsSinceReference = monthsBetween(referenceDate, today); // negativ wenn künftig
    const blockedUntil = addMonths(referenceDate, 12);
    const blocked = today < blockedUntil;

    // Kappungsgrenze: Miete, die vor 3 Jahren galt.
    // Vertrag jünger als 3 Jahre → Kappungsbasis ist die Initialmiete.
    const threeYearsAgo = addMonths(today, -36);
    let rentThreeYearsAgoCents: number;
    if (lease.startDate <= threeYearsAgo) {
      const adjBefore = lease.rentAdjustments.filter((a) => a.effectiveDate <= threeYearsAgo);
      rentThreeYearsAgoCents = adjBefore.length > 0 ? adjBefore[adjBefore.length - 1]!.rentCents : lease.rentCents;
    } else {
      rentThreeYearsAgoCents = lease.rentCents;
    }
    const capLimitCents = Math.round(rentThreeYearsAgoCents * 1.2);
    // Headroom: gegen die künftige Baseline rechnen, denn die geplante Anpassung
    // zählt schon auf die Kappungsgrenze an.
    const capHeadroomCents = capLimitCents - baselineRentCents;

    // Vergleichsmiete (Property)
    const refRentSqm = lease.unit.property.referenceRentCentsPerSqm ?? null;
    const targetRentCents = refRentSqm != null && livingArea > 0
      ? Math.round(refRentSqm * livingArea)
      : null;
    const targetDeltaCents = targetRentCents != null ? targetRentCents - baselineRentCents : null;

    // Tatsächliches Potential = min(targetRent, capLimit) − baseline, nie < 0
    let potentialNewRentCents: number | null = null;
    let potentialDeltaCents: number | null = null;
    if (targetRentCents != null) {
      const newRent = Math.max(baselineRentCents, Math.min(targetRentCents, capLimitCents));
      potentialNewRentCents = newRent;
      potentialDeltaCents = newRent - baselineRentCents;
    }

    // VPI-Drift seit Referenz (rein informativ).
    // Bei künftiger Referenz ggf. kein VPI-Wert verfügbar → null.
    const refVpi = vpiAt(referenceDate.slice(0, 7));
    let vpiDriftPercent: number | null = null;
    let vpiNeutralRentCents: number | null = null;
    if (refVpi && latestVpi && refVpi.value > 0 && referenceDate <= today) {
      vpiDriftPercent = ((latestVpi.value / refVpi.value) - 1) * 100;
      vpiNeutralRentCents = Math.round(currentRentCents * (1 + vpiDriftPercent / 100));
    }

    // Sparkline: Treppenfunktion der eigenen Kaltmiete vom Vertragsbeginn bis heute.
    // Jede vergangene Anpassung mit echter Kaltmieten-Änderung ist eine Stufe.
    const rentSeries: Array<{ date: string; rentCents: number }> = [
      { date: lease.startDate, rentCents: lease.rentCents },
      ...past.map((a) => ({ date: a.effectiveDate, rentCents: a.rentCents })),
      { date: today, rentCents: currentRentCents }, // Endpunkt für die Linie
    ];

    out.push({
      leaseId: lease.id,
      unitName: lease.unit.name,
      propertyLabel: `${lease.unit.property.street}, ${lease.unit.property.city}`,
      tenantsLabel: lease.leaseTenants.map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`).join(" · "),
      livingArea,
      currentRentCents,
      currentRentPerSqmCents,
      referenceDate,
      referenceLabel,
      monthsSinceReference,
      blockedUntil,
      blocked,
      rentThreeYearsAgoCents,
      capLimitCents,
      capHeadroomCents,
      referenceRentCentsPerSqm: refRentSqm,
      targetRentCents,
      targetDeltaCents,
      potentialNewRentCents,
      potentialDeltaCents,
      vpiDriftPercent,
      vpiNeutralRentCents,
      plannedAdjustmentDate: plannedAdj?.effectiveDate ?? null,
      plannedAdjustmentRentCents: plannedAdj?.rentCents ?? null,
      plannedAdjustmentDeltaCents: plannedDelta,
      rentSeries,
      plannedRentPoint: plannedAdj ? { date: plannedAdj.effectiveDate, rentCents: plannedAdj.rentCents } : null,
      todayDate: today,
    });
  }

  // Sortierung: nach monatlichem Potential absteigend, sonst nach Monaten seit Referenz absteigend
  out.sort((a, b) => {
    const ap = a.potentialDeltaCents ?? -1;
    const bp = b.potentialDeltaCents ?? -1;
    if (ap !== bp) return bp - ap;
    return b.monthsSinceReference - a.monthsSinceReference;
  });

  return out;
}

export async function getGraduatedLeaseNextStepAction(): Promise<GraduatedLeaseNextStep[]> {
  await requireUser();
  const today = todayLocal();

  const gradLeases = await db.query.leases.findMany({
    where: and(eq(leases.rentType, "graduated"), isNull(leases.deletedAt)),
    with: {
      unit: { with: { property: true } },
      leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
      rentAdjustments: {
        where: (r, { isNull }) => isNull(r.deletedAt),
        orderBy: (r, { asc }) => [asc(r.effectiveDate)],
      },
    },
  });

  const out: GraduatedLeaseNextStep[] = [];

  for (const lease of gradLeases) {
    if (lease.endDate && lease.endDate < today) continue;

    const past = lease.rentAdjustments.filter((a) => a.effectiveDate <= today);
    const future = lease.rentAdjustments.filter((a) => a.effectiveDate > today);
    const last = past.length > 0 ? past[past.length - 1]! : null;
    const next = future.length > 0 ? future[0]! : null;

    const currentRentCents = last ? last.rentCents : lease.rentCents;
    const lastStepDate = last ? last.effectiveDate : lease.startDate;
    const livingArea = lease.unit.livingArea;
    const currentRentPerSqmCents = livingArea > 0 ? Math.round(currentRentCents / livingArea) : 0;

    const nextStepDate = next?.effectiveDate ?? null;
    const nextStepRentCents = next?.rentCents ?? null;
    const nextStepDeltaCents = nextStepRentCents != null ? nextStepRentCents - currentRentCents : null;
    const nextStepPercent = nextStepRentCents != null && currentRentCents > 0
      ? ((nextStepRentCents / currentRentCents) - 1) * 100
      : null;
    const monthsUntilNext = nextStepDate ? monthsBetween(today, nextStepDate) : null;

    // Sparkline: alle Staffelstufen — Vergangenheit + Zukunft.
    const stepsSeries: Array<{ date: string; rentCents: number; future: boolean }> = [
      { date: lease.startDate, rentCents: lease.rentCents, future: lease.startDate > today },
      ...lease.rentAdjustments.map((a) => ({
        date: a.effectiveDate,
        rentCents: a.rentCents,
        future: a.effectiveDate > today,
      })),
    ];

    out.push({
      leaseId: lease.id,
      unitName: lease.unit.name,
      propertyLabel: `${lease.unit.property.street}, ${lease.unit.property.city}`,
      tenantsLabel: lease.leaseTenants.map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`).join(" · "),
      livingArea,
      currentRentCents,
      currentRentPerSqmCents,
      nextStepDate,
      nextStepRentCents,
      nextStepDeltaCents,
      nextStepPercent,
      monthsUntilNext,
      lastStepDate,
      isFinalStep: future.length === 0,
      stepsSeries,
      todayDate: today,
    });
  }

  // Sortierung: nächste anstehende Stufe zuerst, Verträge ohne weitere Stufe ans Ende
  out.sort((a, b) => {
    if (a.nextStepDate && b.nextStepDate) return a.nextStepDate.localeCompare(b.nextStepDate);
    if (a.nextStepDate) return -1;
    if (b.nextStepDate) return 1;
    return 0;
  });

  return out;
}

export async function fetchVpiFromDestatisAction(): Promise<FetchResult> {
  const user = await requireUser();

  // Startjahr = frühester Vertragsbeginn (egal welcher rentType — VPI-Drift wird
  // auch auf Fest- und Staffelmieten-Karten angezeigt). VPI-Basis ist 2020.
  const earliest = await db.query.leases.findFirst({
    where: isNull(leases.deletedAt),
    orderBy: (l, { asc }) => [asc(l.startDate)],
  });
  const startYear = earliest
    ? Math.max(2020, parseInt(earliest.startDate.slice(0, 4)))
    : 2020;
  const endYear = new Date().getFullYear();

  // Token-Lookup: zuerst aus app_settings, dann Fallback aus .env.
  const settingsRow = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  const token = settingsRow?.destatisToken?.trim() || process.env.DESTATIS_TOKEN;
  if (!token) {
    return { ok: false, error: "Destatis-Token fehlt. Bitte unter Einstellungen → API-Zugänge eintragen." };
  }

  // GENESIS-Online 2020 REST API: POST mit Token im `username`-Header.
  // Antwort enthält Object.Content als CSV-Blob (Format=datencsv).
  let json: { Object?: { Content?: string }; Status?: { Code?: number; Content?: string } };
  try {
    const body = new URLSearchParams({
      name: "61111-0002",
      area: "all",
      compress: "false",
      format: "json",
      startyear: String(startYear),
      endyear: String(endYear),
    });
    const res = await fetch("https://genesis.destatis.de/genesisWS/rest/2020/data/table", {
      method: "POST",
      headers: {
        "username": token,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: body.toString(),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `Destatis antwortet nicht (HTTP ${res.status}).` };
    }
    json = await res.json();
  } catch (e) {
    return { ok: false, error: `Netzwerkfehler: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (json.Status?.Code !== undefined && json.Status.Code !== 0 && json.Status.Code !== 22) {
    return { ok: false, error: `Destatis: ${json.Status?.Content ?? "Unbekannter Fehler"}` };
  }
  const csv = json.Object?.Content;
  if (!csv) {
    return { ok: false, error: "Destatis: leere Antwort (Object.Content fehlt)." };
  }

  const points = extractVpiPoints(csv);
  if (points.length === 0) {
    return { ok: false, error: "Keine Daten geparst. Das CSV-Format könnte sich geändert haben." };
  }

  // Upsert into DB — only overwrite if value changed
  let added = 0, updated = 0;
  for (const { yearMonth, value } of points) {
    const existing = await db.query.vpiEntries.findFirst({
      where: eq(vpiEntries.yearMonth, yearMonth),
    });
    if (existing) {
      if (Math.abs(existing.value - value) > 0.005) {
        await db.update(vpiEntries)
          .set({ value, updatedAt: new Date() })
          .where(eq(vpiEntries.id, existing.id));
        updated++;
      }
    } else {
      await db.insert(vpiEntries).values({ id: createId(), yearMonth, value });
      added++;
    }
  }

  await writeAuditLog({
    userId: user.id,
    action: "vpi.fetch",
    entity: "vpi_entry",
    entityId: "destatis",
    after: { added, updated, startYear, endYear, total: points.length },
  });

  revalidatePath("/cpi");
  revalidatePath("/dashboard");
  return { ok: true, added, updated };
}

export async function upsertVpiEntryAction(yearMonth: string, value: number): Promise<ActionResult> {
  const user = await requireUser();

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return { ok: false, error: "Ungültiges Datum (YYYY-MM)." };
  if (isNaN(value) || value <= 0) return { ok: false, error: "Ungültiger Indexwert." };

  const existing = await db.query.vpiEntries.findFirst({
    where: eq(vpiEntries.yearMonth, yearMonth),
  });

  if (existing) {
    await db.update(vpiEntries)
      .set({ value, updatedAt: new Date() })
      .where(eq(vpiEntries.id, existing.id));
    await writeAuditLog({ userId: user.id, action: "vpi.update", entity: "vpi_entry", entityId: existing.id, before: existing as Record<string, unknown>, after: { yearMonth, value } });
  } else {
    const id = createId();
    await db.insert(vpiEntries).values({ id, yearMonth, value });
    await writeAuditLog({ userId: user.id, action: "vpi.create", entity: "vpi_entry", entityId: id, after: { yearMonth, value } });
  }

  revalidatePath("/cpi");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteVpiEntryAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const entry = await db.query.vpiEntries.findFirst({ where: eq(vpiEntries.id, id) });
  if (!entry) return { ok: false, error: "Eintrag nicht gefunden." };

  await db.delete(vpiEntries).where(eq(vpiEntries.id, id));
  await writeAuditLog({ userId: user.id, action: "vpi.delete", entity: "vpi_entry", entityId: id, before: entry as Record<string, unknown> });

  revalidatePath("/cpi");
  revalidatePath("/dashboard");
  return { ok: true };
}
