import { getPropertiesAction } from "@/server/actions/properties";
import { ExpenseForm } from "@/components/expense/expense-form";

export const metadata = { title: "Neue Ausgabe – Domora" };

export default async function NewExpensePage() {
  const propertyList = await getPropertiesAction();
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Neue Ausgabe</h1>
      <ExpenseForm mode="create" properties={properties} />
    </div>
  );
}
