"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { documents, expenseDocuments, expenses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { rankReceiptCandidates } from "@/lib/expense-receipts";

type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateReceiptViews(expenseId: string) {
  revalidatePath("/expenses");
  revalidatePath(`/expenses/${expenseId}/edit`);
  revalidatePath("/documents");
  revalidatePath("/dashboard");
}

export async function linkReceiptAction(expenseId: string, documentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const [exp, doc] = await Promise.all([
    db.query.expenses.findFirst({ where: and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)) }),
    db.query.documents.findFirst({ where: and(eq(documents.id, documentId), isNull(documents.deletedAt)) }),
  ]);
  if (!exp) return { ok: false, error: "Ausgabe nicht gefunden." };
  if (!doc) return { ok: false, error: "Dokument nicht gefunden." };

  await db.insert(expenseDocuments).values({ expenseId, documentId }).onConflictDoNothing();
  await writeAuditLog({ userId: user.id, action: "expense.receipt.link", entity: "expense", entityId: expenseId, after: { documentId, filename: doc.filename } });

  revalidateReceiptViews(expenseId);
  return { ok: true };
}

export async function unlinkReceiptAction(expenseId: string, documentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const link = await db.query.expenseDocuments.findFirst({
    where: and(eq(expenseDocuments.expenseId, expenseId), eq(expenseDocuments.documentId, documentId)),
  });
  if (!link) return { ok: false, error: "Verknüpfung nicht gefunden." };

  // Nur die Verknüpfung wird gelöst — das Dokument selbst bleibt erhalten.
  await db.delete(expenseDocuments).where(and(eq(expenseDocuments.expenseId, expenseId), eq(expenseDocuments.documentId, documentId)));
  await writeAuditLog({ userId: user.id, action: "expense.receipt.unlink", entity: "expense", entityId: expenseId, before: { documentId } });

  revalidateReceiptViews(expenseId);
  return { ok: true };
}

// Verknüpfte Belege einer Ausgabe plus Vorschläge und alle übrigen Dokumente zur Auswahl
export async function getExpenseReceiptsAction(expenseId: string) {
  await requireUser();
  const exp = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)),
    with: { receiptLinks: { with: { document: true } } },
  });
  if (!exp) return null;

  const linked = exp.receiptLinks.map((l) => l.document).filter((d) => d.deletedAt == null);
  const linkedIds = new Set(linked.map((d) => d.id));
  // Mieter-/Vertragsunterlagen sind keine Belege für Ausgaben
  const pool = (await db.query.documents.findMany({
    where: isNull(documents.deletedAt),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  })).filter((d) => !linkedIds.has(d.id) && (d.entityType === "property" || d.entityType === "general"));

  const suggestions = rankReceiptCandidates(exp, pool);
  const suggestionIds = new Set(suggestions.map((d) => d.id));
  const expYear = parseInt(exp.date.slice(0, 4), 10);
  // Weitere Dokumente: gleiches Objekt/allgemein, Belegjahr ± 1
  const others = pool.filter(
    (d) =>
      !suggestionIds.has(d.id) &&
      (d.entityType === "general" || d.entityId === exp.propertyId || exp.propertyId == null) &&
      (d.year == null || Math.abs(d.year - expYear) <= 1),
  );

  const pick = (d: typeof pool[number]) => ({ id: d.id, filename: d.filename, title: d.title, mimeType: d.mimeType, year: d.year });
  return {
    expense: { id: exp.id, propertyId: exp.propertyId, date: exp.date },
    linked: linked.map(pick),
    suggestions: suggestions.map((d) => pick(pool.find((p) => p.id === d.id)!)),
    others: others.map(pick),
  };
}
