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

type ActionResult = { ok: true } | { ok: false; error: string };

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

export async function createExpenseAction(data: ExpenseFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = expenseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  await db.insert(expenses).values({ id, ...toDb(parsed.data) });

  await writeAuditLog({ userId: user.id, action: "expense.create", entity: "expense", entityId: id, after: parsed.data });

  revalidatePath("/expenses");
  return { ok: true };
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

  let result = rows;

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
