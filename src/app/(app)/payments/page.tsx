import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getPaymentsByMonthAction, getOpenPaymentsAction, generatePaymentsAction, markAsUnpaidAction } from "@/server/actions/payments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate, formatMonthLong as formatMonthLabel, currentYearMonth, offsetMonth, todayLocal } from "@/lib/dates";
import { Private } from "@/components/private";
import { CheckCircle2, Pencil, TrendingUp, AlertTriangle, Clock, RotateCcw } from "lucide-react";
import { PartialPaymentButton } from "@/components/payment/partial-payment-button";
import { MarkPaidButton } from "@/components/payment/mark-paid-button";
import { DeleteUnpaidButton } from "@/components/payment/delete-unpaid-button";
import { toEuros } from "@/lib/money";

export const metadata = { title: "Zahlungen – Domora" };

type PaymentRow = {
  paidAt: string | null;
  dueDate: string;
  paidCents: number | null;
  rentCents: number;
  serviceChargesCents: number | null;
};

function paymentStatus(p: PaymentRow): "open" | "overdue" | "partial" | "paid" {
  const today = todayLocal();
  const soll = p.rentCents + (p.serviceChargesCents ?? 0);
  const paid = p.paidCents ?? 0;
  if (paid >= soll && paid > 0) return "paid";
  if (paid > 0) return "partial";
  if (p.dueDate < today) return "overdue";
  return "open";
}

function StatusBadge({ payment }: { payment: PaymentRow }) {
  const status = paymentStatus(payment);
  if (status === "paid") return <Badge variant="success">Bezahlt</Badge>;
  if (status === "partial") return <Badge variant="warning">Teilbezahlt</Badge>;
  if (status === "overdue") return <Badge variant="destructive">Überfällig</Badge>;
  return <Badge variant="secondary">Offen</Badge>;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const ym = month ?? currentYearMonth();
  const prev = offsetMonth(ym, -1);
  const next = offsetMonth(ym, 1);

  const [monthPayments, openPayments] = await Promise.all([
    getPaymentsByMonthAction(ym),
    getOpenPaymentsAction(),
  ]);

  const totalSoll = monthPayments.reduce((s, p) => s + p.rentCents + (p.serviceChargesCents ?? 0), 0);
  const totalPaid = monthPayments.reduce((s, p) => s + (p.paidCents ?? 0), 0);
  const totalOpen = monthPayments.filter((p) => !p.paidAt).reduce((s, p) => s + p.rentCents + (p.serviceChargesCents ?? 0), 0);
  const paidCount = monthPayments.filter((p) => p.paidAt).length;
  const pct = totalSoll > 0 ? Math.round((totalPaid / totalSoll) * 100) : 0;

  async function generate(formData: FormData) {
    "use server";
    const m = formData.get("month") as string;
    await generatePaymentsAction(m);
    revalidatePath("/payments");
  }

  async function markUnpaid(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    await markAsUnpaidAction(id);
    revalidatePath("/payments");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Zahlungen</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <DeleteUnpaidButton />
          <form action={generate}>
            <input type="hidden" name="month" value={ym} />
            <Button size="sm" type="submit" variant="outline">
              {formatMonthLabel(ym)} generieren
            </Button>
          </form>
        </div>
      </div>

      {/* Monatsnavigation */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/payments?month=${prev}`}>←</Link>
        </Button>
        <span className="text-lg font-semibold w-48 text-center">{formatMonthLabel(ym)}</span>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/payments?month=${next}`}>→</Link>
        </Button>
      </div>

      {/* Zusammenfassung */}
      {monthPayments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card px-5 py-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="size-3.5" />
              <span className="text-xs">Soll gesamt</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{formatMoney(totalSoll)}</p>
            <p className="text-xs text-muted-foreground">{monthPayments.length} Mieter</p>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4 space-y-1">
            <div className="flex items-center gap-2 text-green-500 mb-2">
              <CheckCircle2 className="size-3.5" />
              <span className="text-xs">Eingegangen</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-green-500">{formatMoney(totalPaid)}</p>
            <p className="text-xs text-muted-foreground">{pct} % · {paidCount} von {monthPayments.length}</p>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4 space-y-1">
            <div className={`flex items-center gap-2 mb-2 ${totalOpen > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              <Clock className="size-3.5" />
              <span className="text-xs">Noch offen</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${totalOpen > 0 ? "text-destructive" : ""}`}>
              {formatMoney(totalOpen)}
            </p>
            <p className="text-xs text-muted-foreground">
              {monthPayments.length - paidCount} Zahlung{monthPayments.length - paidCount !== 1 ? "en" : ""}
            </p>
          </div>
        </div>
      )}

      {/* Monatstabelle */}
      {monthPayments.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Keine Zahlungen für {formatMonthLabel(ym)}.{" "}
          <form action={generate} className="inline">
            <input type="hidden" name="month" value={ym} />
            <button type="submit" className="underline hover:no-underline">Jetzt generieren</button>
          </form>
        </div>
      ) : (
        <>
        {/* Mobile: Cards */}
        <div className="space-y-3 md:hidden">
          {monthPayments.map((p) => {
            const soll = p.rentCents + (p.serviceChargesCents ?? 0);
            const paid = p.paidCents ?? 0;
            const open = Math.max(0, soll - paid);
            const status = paymentStatus(p);
            const tenantLine = p.lease.leaseTenants.map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`).join(" · ");
            return (
              <div key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      <Private>{tenantLine}</Private>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{p.lease.unit.name}</p>
                  </div>
                  <StatusBadge payment={p} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Soll</p>
                    <p className="font-medium tabular-nums">{formatMoney(soll)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {status === "paid" ? "Bezahlt" : status === "partial" ? "Erhalten" : "Offen"}
                    </p>
                    <p className={`font-medium tabular-nums ${status === "paid" ? "text-green-600" : status === "partial" ? "text-amber-600" : "text-destructive"}`}>
                      {p.paidCents != null ? formatMoney(p.paidCents) : formatMoney(soll)}
                    </p>
                    {status === "partial" && <p className="text-xs text-muted-foreground">offen {formatMoney(open)}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {status === "paid" ? (
                    <form action={markUnpaid} className="flex-1">
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" size="sm" variant="outline" className="w-full text-muted-foreground hover:text-amber-500">
                        <RotateCcw className="size-3.5" />
                        Zurücksetzen
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex-1 min-w-[180px]">
                        <PartialPaymentButton paymentId={p.id} defaultAmountEur={toEuros(open)} defaultReceivedAt={p.dueDate} />
                      </div>
                      <div className="flex-1">
                        <MarkPaidButton paymentId={p.id} defaultPaidAt={p.dueDate} label="Voll bezahlt" triggerClassName="w-full" />
                      </div>
                    </>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/payments/${p.id}/edit`}>
                      <Pencil className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: Tabelle */}
        <div className="hidden md:block rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="text-left px-4 py-3 font-medium">Mieter</th>
                <th className="text-left px-4 py-3 font-medium">Einheit</th>
                <th className="text-right px-4 py-3 font-medium">Soll</th>
                <th className="text-right px-4 py-3 font-medium">Erhalten</th>
                <th className="text-right px-4 py-3 font-medium">am</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {monthPayments.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {p.lease.leaseTenants.map((lt, i) => (
                      <span key={lt.tenant.id}>{i > 0 && " · "}<Private>{lt.tenant.lastName}, {lt.tenant.firstName}</Private></span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.lease.unit.name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(p.rentCents + (p.serviceChargesCents ?? 0))}
                  </td>
                  {(() => {
                    const soll = p.rentCents + (p.serviceChargesCents ?? 0);
                    const paid = p.paidCents ?? 0;
                    const open = Math.max(0, soll - paid);
                    const status = paymentStatus(p);
                    return (
                      <>
                        <td className={`px-4 py-3 text-right tabular-nums ${status === "paid" ? "text-green-500 font-medium" : status === "partial" ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                          {p.paidCents != null ? formatMoney(p.paidCents) : "–"}
                          {status === "partial" && (
                            <p className="text-xs font-normal text-muted-foreground">offen {formatMoney(open)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatDate(p.paidAt)}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <StatusBadge payment={p} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end items-center flex-wrap">
                            {status === "paid" ? (
                              <form action={markUnpaid}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button type="submit" size="iconSm" variant="ghost" className=" text-muted-foreground hover:text-amber-500" title="Bezahlt-Markierung zurücksetzen">
                                  <RotateCcw className="size-3.5" />
                                </Button>
                              </form>
                            ) : (
                              <>
                                <PartialPaymentButton paymentId={p.id} defaultAmountEur={toEuros(open)} defaultReceivedAt={p.dueDate} />
                                <MarkPaidButton paymentId={p.id} defaultPaidAt={p.dueDate} label="Voll" />
                              </>
                            )}
                            <Button asChild variant="ghost" size="iconSm">
                              <Link href={`/payments/${p.id}/edit`}>
                                <Pencil className="size-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Offene Posten aus vergangenen Monaten */}
      {openPayments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="size-4 text-destructive" />
            <h2 className="text-base font-semibold">Offene Posten aus Vormonaten</h2>
            <Badge variant="destructive">{openPayments.length}</Badge>
          </div>
          <div className="rounded-xl border border-destructive/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-destructive/5">
                <tr className="border-b border-destructive/20">
                  <th className="text-left px-4 py-3 font-medium">Mieter</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Einheit</th>
                  <th className="text-left px-4 py-3 font-medium">Monat</th>
                  <th className="text-right px-4 py-3 font-medium">Offen</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {openPayments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {p.lease.leaseTenants.map((lt, i) => (
                        <span key={lt.tenant.id}>{i > 0 && " · "}<Private>{lt.tenant.lastName}, {lt.tenant.firstName}</Private></span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {p.lease.unit.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatMonthLabel(p.dueDate.slice(0, 7))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-destructive font-medium">
                      {formatMoney(p.rentCents + (p.serviceChargesCents ?? 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <MarkPaidButton paymentId={p.id} defaultPaidAt={p.dueDate} />
                        <Button asChild variant="ghost" size="iconSm">
                          <Link href={`/payments/${p.id}/edit`}>
                            <Pencil className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
