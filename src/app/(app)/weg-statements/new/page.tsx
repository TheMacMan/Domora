import { getPropertiesAction } from "@/server/actions/properties";
import { WegAbrechnungForm } from "@/components/weg-statements/form";

export const metadata = { title: "Neue WEG-Abrechnung – Domora" };

export default async function NewWegAbrechnungPage() {
  const propertyList = await getPropertiesAction();
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Neue WEG-Abrechnung</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Erfasst die Jahresabrechnung deiner Eigentümergemeinschaft. Posten werden automatisch in
          Anlage V (Werbungskosten) und in die NK-Abrechnung an deine Mieter übernommen.
        </p>
      </div>
      <WegAbrechnungForm mode="create" properties={properties} />
    </div>
  );
}
