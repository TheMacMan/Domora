import { PropertyForm } from "@/components/property/property-form";
import { getSettingsAction } from "@/server/actions/settings";

export const metadata = { title: "Neues Objekt – Domora" };

export default async function NewPropertyPage() {
  const settings = await getSettingsAction();
  const defaultAfa = settings.defaultDepreciationPermille != null
    ? settings.defaultDepreciationPermille / 10
    : 2;
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Neues Objekt</h1>
      <PropertyForm mode="create" defaultDepreciationRate={defaultAfa} />
    </div>
  );
}
