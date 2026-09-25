"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createId } from "@paralleldrive/cuid2";
import { eq, isNull, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  documentMetaSchema,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  ENTITY_TYPES,
  GENERAL_ENTITY_ID,
  type EntityType,
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

function extFromMime(mime: string) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "bin";
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

  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { ok: false, error: "Nur PDF, JPG und PNG sind erlaubt." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "Datei ist zu groß (max. 20 MB)." };
  }

  const metaParsed = documentMetaSchema.safeParse({
    tag: formData.get("tag"),
    notes: formData.get("notes") || undefined,
  });
  if (!metaParsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  const ext = extFromMime(file.type);
  const storedName = `${id}.${ext}`;
  const dir = uploadsDir(entityType, entityId);

  await mkdir(dir, { recursive: true });
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(path.join(dir, storedName), bytes);

  await db.insert(documents).values({
    id,
    filename: file.name,
    storedName,
    mimeType: file.type,
    sizeBytes: file.size,
    entityType,
    entityId,
    tag: metaParsed.data.tag,
    notes: metaParsed.data.notes ?? null,
  });

  await writeAuditLog({
    userId: user.id,
    action: "document.upload",
    entity: "document",
    entityId: id,
    after: { filename: file.name, entityType, entityId, tag: metaParsed.data.tag },
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

export async function getDocumentsAction(entityType: EntityType, entityId: string) {
  await requireUser();
  return db.query.documents.findMany({
    where: and(
      eq(documents.entityType, entityType),
      eq(documents.entityId, entityId),
      isNull(documents.deletedAt)
    ),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });
}

// Alle Dokumente mit lesbarer Zuordnung (für die Übersichtsseite /documents)
export async function getAllDocumentsAction() {
  await requireUser();
  const [docs, tenantRows, propertyRows, leaseRows] = await Promise.all([
    db.query.documents.findMany({ where: isNull(documents.deletedAt), orderBy: (d, { desc }) => [desc(d.createdAt)] }),
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
  return docs.map((d) => ({
    ...d,
    entityLabel: label.get(`${d.entityType}:${d.entityId}`) ?? "(unbekannt)",
    entityHref: d.entityType === "general" ? "/documents" : `${ENTITY_PATH[d.entityType as EntityType] ?? ""}/${d.entityId}`,
  }));
}
