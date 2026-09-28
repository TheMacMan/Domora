// Lädt aktive Belegverknüpfungen (ohne gelöste Links und gelöschte Dokumente).
// Kein Server-Action-Modul — nur von Server Actions / Server Components aufrufen.

import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { DOCUMENT_LINK_TARGETS, documentLinks, expenses, expenseSchedules, wegAbrechnungen, type DocumentLinkTarget } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { groupLinksByTarget, type LinkTargetType, type ReceiptLink } from "@/lib/expense-receipts";

export async function loadReceiptLinks(targetTypes?: LinkTargetType[]): Promise<Map<string, ReceiptLink[]>> {
  const rows = await db.query.documentLinks.findMany({
    where: targetTypes
      ? and(isNull(documentLinks.deletedAt), inArray(documentLinks.targetType, targetTypes))
      : isNull(documentLinks.deletedAt),
    with: { document: true },
    orderBy: (l, { asc }) => [asc(l.createdAt)],
  });
  return groupLinksByTarget(
    rows
      .filter((r) => r.document.deletedAt == null)
      .map((r) => ({
        linkId: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        doc: { id: r.document.id, filename: r.document.filename, title: r.document.title, mimeType: r.document.mimeType },
      })),
  );
}

// Verknüpfung anlegen, falls noch nicht aktiv vorhanden
export async function createDocumentLink(userId: string, documentId: string, targetType: DocumentLinkTarget, targetId: string) {
  const existing = await db.query.documentLinks.findFirst({
    where: and(eq(documentLinks.documentId, documentId), eq(documentLinks.targetType, targetType), eq(documentLinks.targetId, targetId), isNull(documentLinks.deletedAt)),
  });
  if (existing) return;
  const id = createId();
  await db.insert(documentLinks).values({ id, documentId, targetType, targetId });
  await writeAuditLog({ userId, action: "document.link", entity: "document", entityId: documentId, after: { linkId: id, targetType, targetId } });
}


// Gibt es das Ziel (nicht gelöscht)? Liefert den geprüften Typ, sonst null. Für Upload-mit-Verknüpfung.
export async function linkTargetExists(targetType: string, targetId: string): Promise<DocumentLinkTarget | null> {
  if (!(DOCUMENT_LINK_TARGETS as readonly string[]).includes(targetType) || !/^[a-z0-9]{10,40}$/.test(targetId)) return null;
  const row =
    targetType === "expense" ? await db.query.expenses.findFirst({ where: and(eq(expenses.id, targetId), isNull(expenses.deletedAt)) })
    : targetType === "expense_schedule" ? await db.query.expenseSchedules.findFirst({ where: and(eq(expenseSchedules.id, targetId), isNull(expenseSchedules.deletedAt)) })
    : await db.query.wegAbrechnungen.findFirst({ where: and(eq(wegAbrechnungen.id, targetId), isNull(wegAbrechnungen.deletedAt)) });
  return row != null ? (targetType as DocumentLinkTarget) : null;
}
