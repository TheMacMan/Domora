"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expenseSchedules, expenses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import {
  expenseScheduleSchema,
  type ExpenseScheduleFormInput,
} from "@/lib/validators/expense-schedule";
import { writeAuditLog } from "@/lib/audit";
import { parseDueDates, scheduleOccurrences } from "@/lib/schedule-dates";

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function toDb(data: ExpenseScheduleFormInput) {
  const base = {
    propertyId: data.propertyId,
    category: data.category,
    amountCents: toCents(data.amountEur),
    description: data.description ?? null,
    notes: data.notes ?? null,
  };
  if (data.kind === "plan") {
    const dates = parseDueDates(data.dueDatesText ?? "").dates;
    // ohne Angabe: Jahr des ersten Termins
    const year =
      data.serviceYear && !Number.isNaN(data.serviceYear) ? data.serviceYear : parseInt(dates[0]!.slice(0, 4), 10);
    return {
      ...base,
      // Start/Ende aus den Terminen — für Listen und Status
      startMonth: dates[0]!.slice(0, 7),
      endMonth: dates[dates.length - 1]!.slice(0, 7),
      dayOfMonth: 1,
      dueDates: dates,
      serviceYear: year,
    };
  }
  return {
    ...base,
    startMonth: data.startMonth!,
    endMonth: data.endMonth || null,
    dayOfMonth: data.dayOfMonth ?? 1,
    dueDates: null,
    serviceYear: null,
  };
}

function horizonMonth(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Generiert oder aktualisiert die Buchungen eines Abos.
// - Monatlich: je Monat in [startMonth, endMonth ?? 12 Monate voraus]
// - Abschlagsplan: je Termin (Wochenende → Montag), Leistungszeitraum = Leistungsjahr
// - Einträge mit `wegAbrechnungId` (in finaler WEG-Abrechnung) werden NICHT verändert.
// - Einträge ohne passenden Termin werden soft-deleted (außer mit wegAbrechnungId).
export async function regenerateSchedule(scheduleId: string): Promise<void> {
  const sched = await db.query.expenseSchedules.findFirst({
    where: and(eq(expenseSchedules.id, scheduleId), isNull(expenseSchedules.deletedAt)),
  });
  if (!sched) return;

  const occurrences = scheduleOccurrences(sched, horizonMonth(12));
  const period = sched.serviceYear
    ? { servicePeriodStart: `${sched.serviceYear}-01-01`, servicePeriodEnd: `${sched.serviceYear}-12-31` }
    : {};

  const existing = await db.query.expenses.findMany({
    where: and(eq(expenses.scheduleId, scheduleId), isNull(expenses.deletedAt)),
  });
  const existingByMonth = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    existingByMonth.set(e.date.slice(0, 7), e);
  }

  for (const o of occurrences) {
    const e = existingByMonth.get(o.key);
    if (!e) {
      await db.insert(expenses).values({
        id: createId(),
        propertyId: sched.propertyId,
        category: sched.category,
        amountCents: sched.amountCents,
        date: o.date,
        description: sched.description,
        isRecurring: true,
        scheduleId,
        ...period,
      });
    } else if (!e.wegAbrechnungId) {
      // nur ändern, wenn nicht in finaler WEG-Abrechnung verankert
      await db
        .update(expenses)
        .set({
          propertyId: sched.propertyId,
          category: sched.category,
          amountCents: sched.amountCents,
          date: o.date,
          description: sched.description,
          ...period,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, e.id));
    }
  }

  const expectedSet = new Set(occurrences.map((o) => o.key));
  for (const e of existing) {
    const ym = e.date.slice(0, 7);
    if (!expectedSet.has(ym) && !e.wegAbrechnungId) {
      await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, e.id));
    }
  }
}

export async function createExpenseScheduleAction(
  data: ExpenseScheduleFormInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = expenseScheduleSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  await db.insert(expenseSchedules).values({ id, ...toDb(parsed.data) });
  await regenerateSchedule(id);

  await writeAuditLog({
    userId: user.id,
    action: "expense_schedule.create",
    entity: "expense_schedule",
    entityId: id,
    after: parsed.data,
  });

  revalidatePath("/expenses");
  revalidatePath("/expenses/recurring");
  return { ok: true, data: { id } };
}

export async function updateExpenseScheduleAction(
  id: string,
  data: ExpenseScheduleFormInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = expenseScheduleSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const before = await db.query.expenseSchedules.findFirst({
    where: eq(expenseSchedules.id, id),
  });
  if (!before || before.deletedAt) return { ok: false, error: "Abo nicht gefunden." };

  await db
    .update(expenseSchedules)
    .set({ ...toDb(parsed.data), updatedAt: new Date() })
    .where(eq(expenseSchedules.id, id));
  await regenerateSchedule(id);

  await writeAuditLog({
    userId: user.id,
    action: "expense_schedule.update",
    entity: "expense_schedule",
    entityId: id,
    before: before as Record<string, unknown>,
    after: parsed.data,
  });

  revalidatePath("/expenses");
  revalidatePath("/expenses/recurring");
  revalidatePath(`/expenses/recurring/${id}/edit`);
  return { ok: true };
}

// Beendet das Abo zum gegebenen Monat (endMonth setzen). Bestehende Expenses bleiben.
export async function endExpenseScheduleAction(
  id: string,
  endMonth: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) {
    return { ok: false, error: "Ungültiger Endmonat." };
  }
  const before = await db.query.expenseSchedules.findFirst({
    where: eq(expenseSchedules.id, id),
  });
  if (!before || before.deletedAt) return { ok: false, error: "Abo nicht gefunden." };

  await db
    .update(expenseSchedules)
    .set({ endMonth, updatedAt: new Date() })
    .where(eq(expenseSchedules.id, id));
  await regenerateSchedule(id);

  await writeAuditLog({
    userId: user.id,
    action: "expense_schedule.end",
    entity: "expense_schedule",
    entityId: id,
    after: { endMonth },
  });

  revalidatePath("/expenses");
  revalidatePath("/expenses/recurring");
  return { ok: true };
}

// Löscht das Abo komplett samt allen verknüpften Expenses (außer mit wegAbrechnungId).
export async function deleteExpenseScheduleAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const before = await db.query.expenseSchedules.findFirst({
    where: eq(expenseSchedules.id, id),
  });
  if (!before || before.deletedAt) return { ok: false, error: "Abo nicht gefunden." };

  // Verknüpfte Expenses soft-deleten (außer mit WEG-Abrechnungs-Bezug)
  const linked = await db.query.expenses.findMany({
    where: and(eq(expenses.scheduleId, id), isNull(expenses.deletedAt)),
  });
  for (const e of linked) {
    if (!e.wegAbrechnungId) {
      await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, e.id));
    }
  }

  await db
    .update(expenseSchedules)
    .set({ deletedAt: new Date() })
    .where(eq(expenseSchedules.id, id));

  await writeAuditLog({
    userId: user.id,
    action: "expense_schedule.delete",
    entity: "expense_schedule",
    entityId: id,
    before: before as Record<string, unknown>,
  });

  revalidatePath("/expenses");
  revalidatePath("/expenses/recurring");
  return { ok: true };
}

export async function getExpenseSchedulesAction() {
  await requireUser();
  const rows = await db.query.expenseSchedules.findMany({
    where: isNull(expenseSchedules.deletedAt),
    orderBy: [desc(expenseSchedules.startMonth), asc(expenseSchedules.category)],
    with: { property: true },
  });
  return rows;
}

export async function getExpenseScheduleAction(id: string) {
  await requireUser();
  const row = await db.query.expenseSchedules.findFirst({
    where: and(eq(expenseSchedules.id, id), isNull(expenseSchedules.deletedAt)),
    with: {
      property: true,
      expenses: {
        where: isNull(expenses.deletedAt),
        orderBy: [asc(expenses.date)],
      },
    },
  });
  return row;
}
