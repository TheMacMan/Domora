import { getPropertiesAction } from "@/server/actions/properties";
import { getExpenseScheduleAction } from "@/server/actions/expense-schedules";
import { ExpenseScheduleForm } from "@/components/expense/expense-schedule-form";
import { toEuros } from "@/lib/money";
import { formatDueDates, shiftDueDatesOneYear } from "@/lib/schedule-dates";
import type { ExpenseScheduleFormInput } from "@/lib/validators/expense-schedule";

export const metadata = { title: "Neues Abo – Domora" };

// ?copy=<id>: Abschlagsplan fürs Folgejahr vorbelegen (Termine +1 Jahr, Betrag aus dem neuen Bescheid anpassen)
export default async function NewExpenseSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string }>;
}) {
  const { copy } = await searchParams;
  const [propertyList, source] = await Promise.all([
    getPropertiesAction(),
    copy ? getExpenseScheduleAction(copy) : Promise.resolve(undefined),
  ]);
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  let defaults: Partial<ExpenseScheduleFormInput> | undefined;
  if (source?.dueDates) {
    const year = (source.serviceYear ?? parseInt(source.dueDates[0]!.slice(0, 4), 10)) + 1;
    defaults = {
      kind: "plan",
      propertyId: source.propertyId,
      category: source.category,
      amountEur: toEuros(source.amountCents),
      description: source.description?.replace(/\b20\d{2}\b/g, String(year)) ?? "",
      dueDatesText: formatDueDates(shiftDueDatesOneYear(source.dueDates)),
      serviceYear: year,
    };
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        {defaults ? "Abschlagsplan fürs Folgejahr" : "Neues Abo"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {defaults
          ? "Termine und Beschreibung sind ein Jahr weitergeschoben. Betrag und Termine mit dem neuen Bescheid abgleichen und den Bescheid danach als Beleg anhängen."
          : "Monatlich wiederkehrende Ausgabe (z. B. Hausgeld) oder Abschlagsplan mit festen Terminen aus einem Bescheid."}
      </p>
      <ExpenseScheduleForm mode="create" properties={properties} defaultValues={defaults} />
    </div>
  );
}
