import { notFound } from "next/navigation";
import { getPropertyAction } from "@/server/actions/properties";
import { UnitForm } from "@/components/unit/unit-form";

export const metadata = { title: "Wohneinheit anlegen – Domora" };

export default async function NewUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getPropertyAction(id);

  if (!property || property.deletedAt) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Wohneinheit anlegen</h1>
      <p className="text-muted-foreground mb-6">{property.street}, {property.postalCode} {property.city}</p>
      <UnitForm mode="create" propertyId={id} />
    </div>
  );
}
