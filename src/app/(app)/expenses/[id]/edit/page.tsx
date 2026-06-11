import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getExpenseAction, deleteExpenseAction } from "@/server/actions/expenses";
import { getPropertiesAction } from "@/server/actions/properties";
import { ExpenseForm } from "@/components/expense/expense-form";
import { Button } from "@/components/ui/button";
import { toEuros } from "@/lib/money";
import { Trash2, Repeat } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Ausgabe bearbeiten – Domora" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [expense, propertyList] = await Promise.all([
    getExpenseAction(id),
    getPropertiesAction(),
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
    </div>
  );
}
