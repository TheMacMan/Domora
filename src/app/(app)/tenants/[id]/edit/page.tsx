import { notFound } from "next/navigation";
import { getTenantAction } from "@/server/actions/tenants";
import { TenantForm } from "@/components/tenant/tenant-form";
import type { TenantFormInput } from "@/lib/validators/tenant";

export const metadata = { title: "Mieter bearbeiten – Domora" };

export default async function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenantAction(id);

  if (!tenant || tenant.deletedAt) notFound();

  const defaultValues: TenantFormInput = {
    firstName: tenant.firstName,
    lastName: tenant.lastName,
    email: tenant.email ?? "",
    phone: tenant.phone ?? "",
    notes: tenant.notes ?? undefined,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Mieter bearbeiten</h1>
      <p className="text-muted-foreground mb-6">{tenant.firstName} {tenant.lastName}</p>
      <TenantForm mode="edit" tenantId={id} defaultValues={defaultValues} />
    </div>
  );
}
