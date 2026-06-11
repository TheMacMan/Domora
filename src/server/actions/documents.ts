"use server";

import { mkdir, writeFile, unlink } from "fs/promises";
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
  type EntityType,
} from "@/lib/validators/document";

type ActionResult = { ok: true } | { ok: false; error: string };

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

  revalidatePath(`/${entityType}s/${entityId}`);
  return { ok: true };
}

export async function deleteDocumentAction(id: string, entityType: EntityType, entityId: string): Promise<ActionResult> {
  const user = await requireUser();

  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc || doc.deletedAt) return { ok: false, error: "Dokument nicht gefunden." };

  // Soft delete first, then attempt file removal
  await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, id));

  try {
    const filePath = path.join(uploadsDir(entityType, entityId), doc.storedName);
    await unlink(filePath);
  } catch {
    // File already gone — not a hard error
  }

  await writeAuditLog({
    userId: user.id,
    action: "document.delete",
    entity: "document",
    entityId: id,
    before: doc as Record<string, unknown>,
  });

  revalidatePath(`/${entityType}s/${entityId}`);
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
