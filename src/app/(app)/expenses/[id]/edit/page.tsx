import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getExpenseAction, deleteExpenseAction } from "@/server/actions/expenses";
import { getPropertiesAction } from "@/server/actions/properties";
import { getReceiptPanelAction } from "@/server/actions/document-links";
import { getDocumentTargetsAction } from "@/server/actions/documents";
import { ReceiptsSection } from "@/components/expense/receipts-section";
import { ExpenseForm } from "@/components/expense/expense-form";
import { Button } from "@/components/ui/button";
import { toEuros } from "@/lib/money";
import { Trash2, Repeat } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Ausgabe bearbeiten – Domora" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [expense, propertyList, receipts, targets] = await Promise.all([
    getExpenseAction(id),
    getPropertiesAction(),
    getReceiptPanelAction("expense", id),
    getDocumentTargetsAction(),
  ]);

  if (!expense) notFound();

  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  async function handleDelete() {
    "use server";
    const res = await deleteExpenseAction(id);
    if (!res.ok) {
      // Bei Abo-Buchungen: zurück zur Liste, UI zeigt Hinweis dort nicht — Schutz ist hart.
      return;
    }
    revalidatePath("/expenses");
    redirect("/expenses");
  }

  if (expense.tripId) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Fahrtkosten</h1>
        <div className="rounded-xl border bg-card p-5 space-y-3 text-sm">
          <p>Diese Buchung wird aus einer Fahrt und dem km-Satz des Fahrzeugs berechnet und kann hier nicht bearbeitet werden.</p>
          <Button asChild size="sm">
            <Link href={`/expenses/trips/${expense.tripId}/edit`}>Zur Fahrt</Link>
          </Button>
        </div>
        {receipts && <ReceiptsSection targetType="expense" targetId={id} data={receipts} targets={targets} />}
      </div>
    );
  }

  if (expense.scheduleId) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Ausgabe aus Abo</h1>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Repeat className="size-4 text-muted-foreground" />
            <span>
              Diese Buchung wird automatisch aus einem Abo erzeugt und kann hier nicht
              einzeln bearbeitet oder gelöscht werden.
            </span>
          </div>
          <Button asChild size="sm">
            <Link href={`/expenses/recurring/${expense.scheduleId}/edit`}>
              Zum Abo
            </Link>
          </Button>
        </div>
        {receipts && (
          <ReceiptsSection
            targetType="expense"
            targetId={id}
            data={receipts}
            targets={targets}
            hint="Belege am Abo (z. B. Wirtschaftsplan) gelten für alle Monate. Hier kannst du zusätzlich einen Beleg nur für diesen Monat verknüpfen."
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Ausgabe bearbeiten</h1>
        <form action={handleDelete}>
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 className="size-4" />
            Löschen
          </Button>
        </form>
      </div>
      <ExpenseForm
        mode="edit"
        expenseId={id}
        properties={properties}
        defaultValues={{
          propertyId: expense.propertyId,
          category: expense.category,
          amountEur: toEuros(expense.amountCents),
          date: expense.date,
          description: expense.description ?? undefined,
          isRecurring: expense.isRecurring,
          servicePeriodStart: expense.servicePeriodStart ?? "",
          servicePeriodEnd: expense.servicePeriodEnd ?? "",
          notes: expense.notes ?? undefined,
        }}
      />
      {receipts && <ReceiptsSection targetType="expense" targetId={id} data={receipts} targets={targets} />}
    </div>
  );
}
