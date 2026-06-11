import { TenantForm } from "@/components/tenant/tenant-form";

export const metadata = { title: "Neuer Mieter – Domora" };

export default function NewTenantPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Neuer Mieter</h1>
      <TenantForm mode="create" />
    </div>
  );
}
