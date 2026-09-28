// Lädt aktive Belegverknüpfungen (ohne gelöste Links und gelöschte Dokumente).
// Kein Server-Action-Modul — nur von Server Actions / Server Components aufrufen.

import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { DOCUMENT_LINK_TARGETS, documentLinks, expenses, expenseSchedules, trips, vehicleCosts, vehicleYears, wegAbrechnungen, type DocumentLinkTarget } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { groupLinksByTarget, resolveReceipts, type LinkTargetType, type ReceiptLink } from "@/lib/expense-receipts";
import { allocateCost } from "@/lib/vehicle-rate";

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
    : targetType === "weg_abrechnung" ? await db.query.wegAbrechnungen.findFirst({ where: and(eq(wegAbrechnungen.id, targetId), isNull(wegAbrechnungen.deletedAt)) })
    : targetType === "vehicle_cost" ? await db.query.vehicleCosts.findFirst({ where: and(eq(vehicleCosts.id, targetId), isNull(vehicleCosts.deletedAt)) })
    : await db.query.vehicleYears.findFirst({ where: eq(vehicleYears.id, targetId) });
  return row != null ? (targetType as DocumentLinkTarget) : null;
}

export type ReceiptContext = { byTarget: Map<string, ReceiptLink[]>; vehicleKeysByExpense: Map<string, string[]> };

// Alle Verknüpfungen plus — für Fahrtkosten — die geerbten Ziele (Fahrzeugjahr, Fahrzeugkosten des Jahres)
export async function loadReceiptContext(): Promise<ReceiptContext> {
  const [byTarget, tripRows, yearRows, costRows] = await Promise.all([
    loadReceiptLinks(),
    db.query.trips.findMany({ where: isNull(trips.deletedAt) }),
    db.query.vehicleYears.findMany(),
    db.query.vehicleCosts.findMany({ where: isNull(vehicleCosts.deletedAt) }),
  ]);
  const yearId = new Map(yearRows.map((y) => [`${y.vehicleId}|${y.year}`, y.id]));
  const vehicleKeysByExpense = new Map<string, string[]>();
  for (const tr of tripRows) {
    if (!tr.expenseId) continue;
    const y = tr.date.slice(0, 4);
    const keys: string[] = [];
    const vy = yearId.get(`${tr.vehicleId}|${y}`);
    if (vy) keys.push(`vehicle_year:${vy}`);
    for (const c of costRows) {
      if (c.vehicleId !== tr.vehicleId) continue;
      if (allocateCost(c, `${y}-01-01`, `${y}-12-31`) !== 0) keys.push(`vehicle_cost:${c.id}`);
    }
    vehicleKeysByExpense.set(tr.expenseId, keys);
  }
  return { byTarget, vehicleKeysByExpense };
}

export function expenseReceipts(
  e: { id: string; scheduleId: string | null; wegAbrechnungId: string | null },
  ctx: ReceiptContext,
) {
  return resolveReceipts(e, ctx.byTarget, ctx.vehicleKeysByExpense.get(e.id));
}
