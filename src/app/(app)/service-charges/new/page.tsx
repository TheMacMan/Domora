import { getPropertiesAction } from "@/server/actions/properties";
import { NkAbrechnungNewForm } from "@/components/service-charges/new-form";

export const metadata = { title: "Neue NK-Abrechnung – Domora" };

export default async function NkAbrechnungNewPage() {
  const propertyList = await getPropertiesAction();
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Neue NK-Abrechnung</h1>
      <NkAbrechnungNewForm properties={properties} />
    </div>
  );
}
