import { getUnitsWithPropertyAction } from "@/server/actions/units";
import { getTenantsForLeasePickerAction } from "@/server/actions/tenants";
import { LeaseForm } from "@/components/lease/lease-form";

export const metadata = { title: "Neuer Mietvertrag – Domora" };

export default async function NewLeasePage() {
  const [unitsRaw, tenants] = await Promise.all([
    getUnitsWithPropertyAction(),
    getTenantsForLeasePickerAction(),
  ]);

  const units = unitsRaw.map((u) => ({
    id: u.id,
    label: `${u.name} – ${u.property.street}, ${u.property.city}`,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Neuer Mietvertrag</h1>
      <LeaseForm mode="create" units={units} tenants={tenants} />
    </div>
  );
}
