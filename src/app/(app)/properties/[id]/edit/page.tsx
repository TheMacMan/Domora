import { notFound } from "next/navigation";
import { getPropertyAction } from "@/server/actions/properties";
import { PropertyForm } from "@/components/property/property-form";
import type { PropertyFormInput } from "@/lib/validators/property";
import { toEuros } from "@/lib/money";

export const metadata = { title: "Objekt bearbeiten – Domora" };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getPropertyAction(id);

  if (!property || property.deletedAt) notFound();

  const defaultValues: PropertyFormInput = {
    street: property.street,
    postalCode: property.postalCode,
    city: property.city,
    yearBuilt: property.yearBuilt ?? undefined,
    purchaseDate: property.purchaseDate ?? undefined,
    purchasePriceTotalEur: property.purchasePriceTotal != null ? toEuros(property.purchasePriceTotal) : undefined,
    purchasePriceLandEur: property.purchasePriceLand != null ? toEuros(property.purchasePriceLand) : undefined,
    depreciationRate: property.depreciationPermille / 10,
    referenceRentEurPerSqm: property.referenceRentCentsPerSqm != null ? toEuros(property.referenceRentCentsPerSqm) : undefined,
    notes: property.notes ?? undefined,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Objekt bearbeiten</h1>
      <p className="text-muted-foreground mb-6">{property.street}, {property.postalCode} {property.city}</p>
      <PropertyForm mode="edit" propertyId={id} defaultValues={defaultValues} />
    </div>
  );
}
