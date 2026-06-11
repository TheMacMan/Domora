import { getPropertiesAction } from "@/server/actions/properties";
import { ExpenseScheduleForm } from "@/components/expense/expense-schedule-form";

export const metadata = { title: "Neues Abo – Domora" };

export default async function NewExpenseSchedulePage() {
  const propertyList = await getPropertiesAction();
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Neues Abo</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Monatlich wiederkehrende Ausgabe (z. B. Hausgeld, Strom-Abschlag).
      </p>
      <ExpenseScheduleForm mode="create" properties={properties} />
    </div>
  );
}
