import { notFound } from "next/navigation";
import { getPropertiesAction } from "@/server/actions/properties";
import { getExpenseScheduleAction } from "@/server/actions/expense-schedules";
import { ExpenseScheduleForm } from "@/components/expense/expense-schedule-form";
import { toEuros } from "@/lib/money";

export const metadata = { title: "Abo bearbeiten – Domora" };

export default async function EditExpenseSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sched, propertyList] = await Promise.all([
    getExpenseScheduleAction(id),
    getPropertiesAction(),
  ]);
  if (!sched) notFound();
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Abo bearbeiten</h1>
      <ExpenseScheduleForm
        mode="edit"
        scheduleId={sched.id}
        properties={properties}
        defaultValues={{
          propertyId: sched.propertyId,
          category: sched.category,
          amountEur: toEuros(sched.amountCents),
          description: sched.description ?? "",
          startMonth: sched.startMonth,
          endMonth: sched.endMonth ?? "",
          dayOfMonth: sched.dayOfMonth,
          notes: sched.notes ?? "",
        }}
      />
    </div>
  );
}
