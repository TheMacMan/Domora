import { notFound } from "next/navigation";
import { getWegAbrechnungAction } from "@/server/actions/weg-statements";
import { WegAbrechnungForm } from "@/components/weg-statements/form";
import { toEuros } from "@/lib/money";
import type { ExpenseCategory } from "@/lib/expense";

export const metadata = { title: "WEG-Abrechnung bearbeiten – Domora" };

export default async function EditWegAbrechnungPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const abr = await getWegAbrechnungAction(id);
  if (!abr) notFound();

  // Saldo-Position rausfiltern — wird automatisch neu berechnet
  const editablePositions = abr.positions
    .filter((p) => p.category !== "weg_saldo")
    .map((p) => ({
      kind: p.category as ExpenseCategory,
      description: p.description ?? "",
      amount: toEuros(p.amountCents).toFixed(2).replace(".", ","),
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          WEG-Abrechnung {abr.year} bearbeiten
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Objekt und Abrechnungsjahr sind fix. Beim Speichern werden alle Posten neu geschrieben
          und der Saldo neu berechnet.
        </p>
      </div>
      <WegAbrechnungForm
        mode="edit"
        defaults={{
          abrechnungId: abr.id,
          propertyId: abr.propertyId,
          propertyLabel: `${abr.property.street}, ${abr.property.postalCode} ${abr.property.city}`,
          year: abr.year,
          abrechnungsDatum: abr.abrechnungsDatum,
          notes: abr.notes ?? "",
          positions:
            editablePositions.length > 0
              ? editablePositions
              : [{ kind: "bk_wasser" as ExpenseCategory, description: "", amount: "" }],
        }}
      />
    </div>
  );
}
