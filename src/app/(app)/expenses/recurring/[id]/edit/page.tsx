import { notFound } from "next/navigation";
import { getPropertiesAction } from "@/server/actions/properties";
import { getExpenseScheduleAction } from "@/server/actions/expense-schedules";
import { ExpenseScheduleForm } from "@/components/expense/expense-schedule-form";
import { toEuros } from "@/lib/money";
import { getReceiptPanelAction } from "@/server/actions/document-links";
import { getDocumentTargetsAction } from "@/server/actions/documents";
import { ReceiptsSection } from "@/components/expense/receipts-section";

export const metadata = { title: "Abo bearbeiten – Domora" };

export default async function EditExpenseSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sched, propertyList, receipts, targets] = await Promise.all([
    getExpenseScheduleAction(id),
    getPropertiesAction(),
    getReceiptPanelAction("expense_schedule", id),
    getDocumentTargetsAction(),
  ]);
  if (!sched) notFound();
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Abo bearbeiten</h1>
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
      {receipts && (
        <ReceiptsSection
          targetType="expense_schedule"
          targetId={id}
          data={receipts}
          targets={targets}
          hint="Belege am Abo (Vertrag, Wirtschaftsplan, Bescheid) gelten für alle daraus erzeugten Buchungen."
        />
      )}
    </div>
  );
}
