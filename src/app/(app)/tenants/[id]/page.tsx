import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTenantAction, deleteTenantAction } from "@/server/actions/tenants";
import { DocumentsSection } from "@/components/document/documents-section";
import { Button } from "@/components/ui/button";
import { Private } from "@/components/private";
import { Pencil, Trash2 } from "lucide-react";

export const metadata = { title: "Mieter – Domora" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2.5 border-b last:border-0 gap-4">
      <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm text-right">{value ?? "–"}</dd>
    </div>
  );
}

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenantAction(id);

  if (!tenant || tenant.deletedAt) notFound();

  async function handleDelete() {
    "use server";
    await deleteTenantAction(id);
    revalidatePath("/tenants");
    redirect("/tenants");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight"><Private>{tenant.firstName} {tenant.lastName}</Private></h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`/tenants/${id}/edit`}>
              <Pencil className="size-4" />
              Bearbeiten
            </Link>
          </Button>
          <form action={handleDelete}>
            <Button variant="destructive" size="sm" type="submit">
              <Trash2 className="size-4" />
              Löschen
            </Button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <dl className="px-6 py-2">
          <Row
            label="E-Mail"
            value={tenant.email ? <a href={`mailto:${tenant.email}`} className="hover:underline"><Private>{tenant.email}</Private></a> : null}
          />
          <Row label="Telefon" value={tenant.phone ? <Private>{tenant.phone}</Private> : null} />
          {tenant.notes && <Row label="Notizen" value={<Private className="whitespace-pre-wrap">{tenant.notes}</Private>} />}
        </dl>
      </div>

      <DocumentsSection
        entityType="tenant"
        entityId={id}
        revalidateUrl={`/tenants/${id}`}
      />

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/tenants">← Alle Mieter</Link>
        </Button>
      </div>
    </div>
  );
}
