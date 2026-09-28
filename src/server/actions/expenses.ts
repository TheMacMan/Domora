"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { expenseSchema, type ExpenseFormInput } from "@/lib/validators/expense";
import { writeAuditLog } from "@/lib/audit";
import { tagForExpenseCategory } from "@/lib/expense-receipts";
import { GENERAL_ENTITY_ID } from "@/lib/validators/document";
import { uploadDocumentAction } from "@/server/actions/documents";
import { expenseReceipts, loadReceiptContext } from "@/server/receipt-links";

type ActionResult = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string; receiptErrors: string[] } | { ok: false; error: string };

function toDb(data: ExpenseFormInput) {
  return {
    propertyId: data.propertyId,
    category: data.category,
    amountCents: toCents(data.amountEur),
    date: data.date,
    description: data.description ?? null,
    isRecurring: data.isRecurring,
    servicePeriodStart: data.servicePeriodStart || null,
    servicePeriodEnd: data.servicePeriodEnd || null,
    notes: data.notes ?? null,
  };
}

// Neue Ausgabe, optional mit Belegen (Dateien in `receipts`, Feld "file"): Ausgabe anlegen,
// Dateien als Dokumente am Objekt der Ausgabe ablegen und direkt verknüpfen.
export async function createExpenseAction(data: ExpenseFormInput, receipts?: FormData): Promise<CreateResult> {
  const user = await requireUser();

  const parsed = expenseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  await db.insert(expenses).values({ id, ...toDb(parsed.data) });

  await writeAuditLog({ userId: user.id, action: "expense.create", entity: "expense", entityId: id, after: parsed.data });

  const receiptErrors: string[] = [];
  const files = receipts?.getAll("file").filter((f): f is File => f instanceof File && f.size > 0) ?? [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tag", tagForExpenseCategory(parsed.data.category));
    fd.append("year", parsed.data.date.slice(0, 4));
    fd.append("linkTargetType", "expense");
    fd.append("linkTargetId", id);
    const res = await uploadDocumentAction(
      parsed.data.propertyId ? "property" : "general",
      parsed.data.propertyId ?? GENERAL_ENTITY_ID,
      fd,
    );
    if (!res.ok) receiptErrors.push(`${file.name}: ${res.error}`);
  }

  revalidatePath("/expenses");
  return { ok: true, id, receiptErrors };
}

export async function updateExpenseAction(id: string, data: ExpenseFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = expenseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const before = await db.query.expenses.findFirst({ where: eq(expenses.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Ausgabe nicht gefunden." };
  if (before.scheduleId) {
    return { ok: false, error: "Diese Buchung gehört zu einem Abo. Bitte das Abo bearbeiten." };
  }
  if (before.tripId) {
    return { ok: false, error: "Diese Buchung wird aus einer Fahrt berechnet. Bitte die Fahrt bearbeiten." };
  }
  if (before.electricitySettlementId) {
    return { ok: false, error: "Diese Buchung stammt aus einer Zwischenzähler-Abrechnung. Bitte dort ändern." };
  }

  await db.update(expenses).set({ ...toDb(parsed.data), updatedAt: new Date() }).where(eq(expenses.id, id));

  await writeAuditLog({ userId: user.id, action: "expense.update", entity: "expense", entityId: id, before: before as Record<string, unknown>, after: parsed.data });

  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const expense = await db.query.expenses.findFirst({ where: eq(expenses.id, id) });
  if (!expense || expense.deletedAt) return { ok: false, error: "Ausgabe nicht gefunden." };
  if (expense.scheduleId) {
    return { ok: false, error: "Diese Buchung gehört zu einem Abo und kann nur über das Abo gelöscht werden." };
  }
  if (expense.tripId) {
    return { ok: false, error: "Diese Buchung gehört zu einer Fahrt und kann nur über die Fahrt gelöscht werden." };
  }
  if (expense.electricitySettlementId) {
    return { ok: false, error: "Diese Buchung stammt aus einer Zwischenzähler-Abrechnung und kann nur dort entfernt werden." };
  }

  await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id));

  await writeAuditLog({ userId: user.id, action: "expense.delete", entity: "expense", entityId: id, before: expense as Record<string, unknown> });

  revalidatePath("/expenses");
  return { ok: true };
}

export async function getExpensesAction(filters?: { propertyId?: string; year?: number }) {
  await requireUser();

  const rows = await db.query.expenses.findMany({
    where: isNull(expenses.deletedAt),
    orderBy: [desc(expenses.date)],
    with: { property: true },
  });
  // Belege: eigene plus geerbte (Abo, WEG-Abrechnung)
  const receiptCtx = await loadReceiptContext();

  let result = rows.map((e) => {
    const receipts = expenseReceipts(e, receiptCtx).map((r) => r.doc);
    return { ...e, receipts, receiptCount: receipts.length };
  });

  if (filters?.propertyId) {
    result = result.filter(
      (e) => e.propertyId === filters.propertyId || e.propertyId === null
    );
  }
  if (filters?.year) {
    result = result.filter((e) => e.date.startsWith(String(filters.year)));
  }

  return result;
}

export async function getExpenseAction(id: string) {
  await requireUser();
  return db.query.expenses.findFirst({
    where: and(eq(expenses.id, id), isNull(expenses.deletedAt)),
    with: { property: true },
  });
}
