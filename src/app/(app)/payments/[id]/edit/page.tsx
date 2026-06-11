import { notFound } from "next/navigation";
import { getPaymentAction } from "@/server/actions/payments";
import { PaymentEditForm } from "@/components/payment/payment-edit-form";
import { toEuros } from "@/lib/money";

export const metadata = { title: "Zahlung bearbeiten – Domora" };

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await getPaymentAction(id);

  if (!payment || payment.deletedAt) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Zahlung bearbeiten</h1>
      <p className="text-muted-foreground mb-6">
        {payment.lease.leaseTenants.map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`).join(" · ")} ·{" "}
        {payment.lease.unit.name} ·{" "}
        {new Date(payment.dueDate).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
      </p>
      <PaymentEditForm
        paymentId={id}
        defaultValues={{
          paidEur: payment.paidCents != null ? toEuros(payment.paidCents) : undefined,
          paidAt: payment.paidAt ?? "",
          notes: payment.notes ?? "",
        }}
        sollCents={payment.rentCents + (payment.serviceChargesCents ?? 0)}
      />
    </div>
  );
}
