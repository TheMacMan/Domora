"use server";

import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import { createId } from "@paralleldrive/cuid2";
import { eq, isNull, and, inArray } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { documents, expenses, expenseSchedules, leases, properties, tenants, vehicleCosts, vehicleYears, wegAbrechnungen, meterReadings, supplyPrices } from "@/db/schema";
import { createDocumentLink, linkTargetExists } from "@/server/receipt-links";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  documentMetaSchema,
  documentUpdateSchema,
  resolveFileType,
  FILE_TYPES_LABEL,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  ENTITY_TYPES,
  GENERAL_ENTITY_ID,
  type EntityType,
  type DocumentUpdateInput,
} from "@/lib/validators/document";

type ActionResult = { ok: true } | { ok: false; error: string };

// Detailseite je Zuordnung (Plural passt nicht bei "property" → "properties")
const ENTITY_PATH: Record<EntityType, string> = { tenant: "/tenants", property: "/properties", lease: "/leases", general: "/documents" };

function revalidateDocumentViews(entityType: EntityType, entityId: string) {
  if (entityType !== "general") revalidatePath(`${ENTITY_PATH[entityType]}/${entityId}`);
  revalidatePath("/documents");
}

// entityType/entityId landen im Dateipfad → nur bekannte Typen und cuid2-IDs zulassen
// (verhindert Pfad-Manipulation wie "../").
function isValidEntity(entityType: string, entityId: string): entityType is EntityType {
  if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) return false;
  if (entityType === "general") return entityId === GENERAL_ENTITY_ID;
  return /^[a-z0-9]{10,40}$/.test(entityId);
}

function uploadsDir(entityType: EntityType, entityId: string) {
  return path.join(process.cwd(), "data", "uploads", entityType, entityId);
}

export async function uploadDocumentAction(
  entityType: EntityType,
  entityId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();

  if (!isValidEntity(entityType, entityId)) return { ok: false, error: "Ungültige Zuordnung." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Keine Datei ausgewählt." };
  }

  const fileType = resolveFileType(file.name);
  if (!fileType) {
    return { ok: false, error: `Dateityp nicht erlaubt (${FILE_TYPES_LABEL}).` };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `Datei ist zu groß (max. ${MAX_FILE_SIZE_MB} MB).` };
  }

  const yearRaw = formData.get("year");
  const metaParsed = documentMetaSchema.safeParse({
    tag: formData.get("tag"),
    notes: formData.get("notes") || undefined,
    year: typeof yearRaw === "string" && yearRaw.trim() ? Number(yearRaw) : undefined,
    title: (formData.get("title") as string | null)?.trim() || undefined,
  });
  if (!metaParsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  const storedName = `${id}.${fileType.ext}`;
  const dir = uploadsDir(entityType, entityId);

  await mkdir(dir, { recursive: true });
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(path.join(dir, storedName), bytes);

  await db.insert(documents).values({
    id,
    filename: file.name,
    storedName,
    mimeType: fileType.mime,
    sizeBytes: file.size,
    entityType,
    entityId,
    tag: metaParsed.data.tag,
    notes: metaParsed.data.notes ?? null,
    year: metaParsed.data.year ?? null,
    title: metaParsed.data.title ?? null,
  });

  // Optional direkt als Beleg verknüpfen (Upload aus „Belege" bei Ausgabe, Abo oder WEG-Abrechnung)
  const linkType = formData.get("linkTargetType");
  const linkId = formData.get("linkTargetId");
  let linkedTo: string | null = null;
  const checkedType = typeof linkType === "string" && typeof linkId === "string" ? await linkTargetExists(linkType, linkId) : null;
  if (checkedType && typeof linkId === "string") {
    await createDocumentLink(user.id, id, checkedType, linkId);
    linkedTo = `${linkType}:${linkId}`;
    revalidatePath("/expenses", "layout");
    revalidatePath("/weg-statements", "layout");
    revalidatePath("/tax", "layout");
  }

  await writeAuditLog({
    userId: user.id,
    action: "document.upload",
    entity: "document",
    entityId: id,
    after: { filename: file.name, entityType, entityId, tag: metaParsed.data.tag, year: metaParsed.data.year ?? null, linkedTo },
  });

  revalidateDocumentViews(entityType, entityId);
  return { ok: true };
}

export async function deleteDocumentAction(id: string, entityType: EntityType, entityId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isValidEntity(entityType, entityId)) return { ok: false, error: "Ungültige Zuordnung." };

  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc || doc.deletedAt) return { ok: false, error: "Dokument nicht gefunden." };

  // Nur Soft-Delete: Die Datei bleibt erhalten (Aufbewahrungspflicht für Belege,
  // i. d. R. 10 Jahre). Endgültiges Löschen erst durch den Aufbewahrungs-Cleanup.
  await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, id));

  await writeAuditLog({
    userId: user.id,
    action: "document.delete",
    entity: "document",
    entityId: id,
    before: doc as Record<string, unknown>,
  });

  revalidateDocumentViews(entityType, entityId);
  return { ok: true };
}

async function entityExists(entityType: EntityType, entityId: string) {
  if (entityType === "general") return entityId === GENERAL_ENTITY_ID;
  const row =
    entityType === "property" ? await db.query.properties.findFirst({ where: eq(properties.id, entityId) })
    : entityType === "tenant" ? await db.query.tenants.findFirst({ where: eq(tenants.id, entityId) })
    : await db.query.leases.findFirst({ where: eq(leases.id, entityId) });
  return row != null && row.deletedAt == null;
}

// Kategorie, Jahr, Anzeigename, Notiz und Zuordnung ändern. Bei neuer Zuordnung wird
// die Datei in das passende Upload-Verzeichnis verschoben.
export async function updateDocumentAction(id: string, data: DocumentUpdateInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = documentUpdateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const d = parsed.data;
  if (!isValidEntity(d.entityType, d.entityId) || !(await entityExists(d.entityType, d.entityId))) {
    return { ok: false, error: "Ungültige Zuordnung." };
  }

  const before = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Dokument nicht gefunden." };
  const beforeType = before.entityType as EntityType;

  const moved = before.entityType !== d.entityType || before.entityId !== d.entityId;
  if (moved) {
    if (!isValidEntity(beforeType, before.entityId)) return { ok: false, error: "Ursprüngliche Zuordnung ungültig." };
    const targetDir = uploadsDir(d.entityType, d.entityId);
    await mkdir(targetDir, { recursive: true });
    try {
      await rename(path.join(uploadsDir(beforeType, before.entityId), before.storedName), path.join(targetDir, before.storedName));
    } catch {
      return { ok: false, error: "Datei konnte nicht verschoben werden." };
    }
  }

  const after = {
    tag: d.tag,
    year: d.year ?? null,
    title: d.title?.trim() || null,
    notes: d.notes?.trim() || null,
    entityType: d.entityType,
    entityId: d.entityId,
  };
  await db.update(documents).set({ ...after, updatedAt: new Date() }).where(eq(documents.id, id));
  await writeAuditLog({ userId: user.id, action: "document.update", entity: "document", entityId: id, before: before as Record<string, unknown>, after });

  revalidateDocumentViews(beforeType, before.entityId);
  if (moved) revalidateDocumentViews(d.entityType, d.entityId);
  return { ok: true };
}

export async function getDocumentsAction(entityType: EntityType, entityId: string) {
  await requireUser();
  return db.query.documents.findMany({
    where: and(
      eq(documents.entityType, entityType),
      eq(documents.entityId, entityId),
      isNull(documents.deletedAt)
    ),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: { links: { where: (l, { isNull: nul }) => nul(l.deletedAt), columns: { id: true } } },
  }).then((rows) => rows.map(({ links, ...d }) => ({ ...d, linkCount: links.length })));
}

// Alle Dokumente mit lesbarer Zuordnung (für die Übersichtsseite /documents)
export async function getAllDocumentsAction() {
  await requireUser();
  const [docs, tenantRows, propertyRows, leaseRows] = await Promise.all([
db.query.documents.findMany({
      where: isNull(documents.deletedAt),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
      with: { links: { where: (l, { isNull: nul }) => nul(l.deletedAt) } },
    }),
    db.query.tenants.findMany(),
    db.query.properties.findMany(),
    db.query.leases.findMany({ with: { unit: true, leaseTenants: { with: { tenant: true } } } }),
  ]);
  const label = new Map<string, string>();
  for (const t of tenantRows) label.set(`tenant:${t.id}`, `${t.lastName}, ${t.firstName}`);
  for (const p of propertyRows) label.set(`property:${p.id}`, `${p.street}, ${p.city}`);
  for (const l of leaseRows) {
    const names = l.leaseTenants.map((lt) => lt.tenant.lastName).join(" / ");
    label.set(`lease:${l.id}`, `Vertrag ${l.unit.name}${names ? ` · ${names}` : ""}`);
  }
  label.set(`general:${GENERAL_ENTITY_ID}`, "Allgemein");
  // Verknüpfte Buchungen je Dokument (Ausgaben, Abos, WEG-Abrechnungen) mit Anzeige-Label
  const linkIds = { expense: new Set<string>(), expense_schedule: new Set<string>(), weg_abrechnung: new Set<string>(), vehicle_cost: new Set<string>(), vehicle_year: new Set<string>(), meter_reading: new Set<string>(), supply_price: new Set<string>() };
  for (const d of docs) for (const l of d.links) linkIds[l.targetType].add(l.targetId);
  const [linkedExpenses, linkedSchedules, linkedWeg] = await Promise.all([
    linkIds.expense.size ? db.query.expenses.findMany({ where: and(inArray(expenses.id, [...linkIds.expense]), isNull(expenses.deletedAt)) }) : [],
    linkIds.expense_schedule.size ? db.query.expenseSchedules.findMany({ where: and(inArray(expenseSchedules.id, [...linkIds.expense_schedule]), isNull(expenseSchedules.deletedAt)) }) : [],
    linkIds.weg_abrechnung.size ? db.query.wegAbrechnungen.findMany({ where: and(inArray(wegAbrechnungen.id, [...linkIds.weg_abrechnung]), isNull(wegAbrechnungen.deletedAt)) }) : [],
  ]);
  const linkLabel = new Map<string, { href: string; label: string }>();
  for (const e of linkedExpenses) linkLabel.set(`expense:${e.id}`, { href: `/expenses/${e.id}/edit`, label: `${e.description || "Ausgabe"} · ${formatDate(e.date)} · ${formatMoney(e.amountCents)}` });
  for (const s2 of linkedSchedules) linkLabel.set(`expense_schedule:${s2.id}`, { href: `/expenses/recurring/${s2.id}/edit`, label: `Abo: ${s2.description || "wiederkehrende Ausgabe"}` });
  for (const w of linkedWeg) linkLabel.set(`weg_abrechnung:${w.id}`, { href: `/weg-statements/${w.id}`, label: `WEG-Abrechnung ${w.year}` });
  const [linkedCosts, linkedYears] = await Promise.all([
    linkIds.vehicle_cost.size ? db.query.vehicleCosts.findMany({ where: and(inArray(vehicleCosts.id, [...linkIds.vehicle_cost]), isNull(vehicleCosts.deletedAt)), with: { vehicle: true } }) : [],
    linkIds.vehicle_year.size ? db.query.vehicleYears.findMany({ where: inArray(vehicleYears.id, [...linkIds.vehicle_year]), with: { vehicle: true } }) : [],
  ]);
  for (const c of linkedCosts) linkLabel.set(`vehicle_cost:${c.id}`, { href: `/expenses/vehicles/${c.vehicleId}`, label: `Fahrzeugkosten ${c.vehicle.name}: ${c.description || formatDate(c.date)} · ${formatMoney(c.amountCents)}` });
  for (const y of linkedYears) linkLabel.set(`vehicle_year:${y.id}`, { href: `/expenses/vehicles/${y.vehicleId}`, label: `Fahrzeug ${y.vehicle.name} ${y.year}` });
  const [linkedReadings, linkedPrices] = await Promise.all([
    linkIds.meter_reading.size ? db.query.meterReadings.findMany({ where: inArray(meterReadings.id, [...linkIds.meter_reading]), with: { meter: true } }) : [],
    linkIds.supply_price.size ? db.query.supplyPrices.findMany({ where: inArray(supplyPrices.id, [...linkIds.supply_price]), with: { lease: { with: { unit: true } } } }) : [],
  ]);
  for (const r of linkedReadings) linkLabel.set(`meter_reading:${r.id}`, { href: `/properties/${r.meter.propertyId}/meters`, label: `Zählerstand ${r.meter.name} ${formatDate(r.date)}` });
  for (const p of linkedPrices) linkLabel.set(`supply_price:${p.id}`, { href: `/properties/${p.lease.unit.propertyId}/meters`, label: `Strompreis ${p.lease.unit.name} ab ${formatDate(p.validFrom)}` });

  const items = docs.map(({ links, ...d }) => ({
    ...d,
    // Buchungen, die dieses Dokument belegt
    linkedTo: links.map((l) => linkLabel.get(`${l.targetType}:${l.targetId}`)).filter((x): x is { href: string; label: string } => x != null),
    entityLabel: label.get(`${d.entityType}:${d.entityId}`) ?? "(unbekannt)",
    entityHref: d.entityType === "general" ? "/documents" : `${ENTITY_PATH[d.entityType as EntityType] ?? ""}/${d.entityId}`,
  }));
  return { docs: items, targets: await getDocumentTargetsAction() };
}

export type DocumentTarget = { value: string; label: string; group: "Allgemein" | "Objekte" | "Mieter" | "Verträge" };

// Mögliche Zuordnungen für Upload und Verschieben ("typ:id")
export async function getDocumentTargetsAction(): Promise<DocumentTarget[]> {
  await requireUser();
  const [propertyRows, tenantRows, leaseRows] = await Promise.all([
    db.query.properties.findMany({ where: isNull(properties.deletedAt), orderBy: (p, { asc }) => [asc(p.city), asc(p.street)] }),
    db.query.tenants.findMany({ where: isNull(tenants.deletedAt), orderBy: (t, { asc }) => [asc(t.lastName), asc(t.firstName)] }),
    db.query.leases.findMany({
      where: isNull(leases.deletedAt),
      with: { unit: true, leaseTenants: { with: { tenant: true } } },
      orderBy: (l, { desc }) => [desc(l.startDate)],
    }),
  ]);
  return [
    { value: `general:${GENERAL_ENTITY_ID}`, label: "Allgemein (objektübergreifend)", group: "Allgemein" },
    ...propertyRows.map((p) => ({ value: `property:${p.id}`, label: `${p.street}, ${p.city}`, group: "Objekte" as const })),
    ...tenantRows.map((t) => ({ value: `tenant:${t.id}`, label: `${t.lastName}, ${t.firstName}`, group: "Mieter" as const })),
    ...leaseRows.map((l) => ({
      value: `lease:${l.id}`,
      label: `${l.unit.name} · ${[...new Set(l.leaseTenants.map((lt) => lt.tenant.lastName))].join(" / ") || "ohne Mieter"} (ab ${l.startDate.slice(0, 4)})`,
      group: "Verträge" as const,
    })),
  ];
}
