import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getNkAbrechnungAction, deleteNkAbrechnungAction, finalizeNkAbrechnungAction, unfinalizeNkAbrechnungAction, recomputeNkAbrechnungAction } from "@/server/actions/service-charges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Private } from "@/components/private";
import { formatMoney } from "@/lib/money";
import { CheckCircle2, Trash2, ArrowRight, Pencil, RotateCcw, Undo2, HomeIcon } from "lucide-react";
import { CATEGORY_LABELS, type ExpenseCategory } from "@/lib/expense";

export const metadata = { title: "NK-Abrechnung – Domora" };

export default async function NkAbrechnungDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abr = await getNkAbrechnungAction(id);
  if (!abr) notFound();

  const totalKosten = abr.leaseAbrechnungen.reduce((s, la) => s + la.kostenAnteilCents, 0);
  const totalVorausz = abr.leaseAbrechnungen.reduce((s, la) => s + la.vorauszahlungenCents, 0);
  const totalSaldo = totalKosten - totalVorausz;
  const totalLeerstand = abr.vacancy.reduce((s, v) => s + v.vacancyShareCents, 0);
  const isFinalized = abr.status === "finalized";

  // Leerstand nach Kategorie gruppieren für die Detailansicht
  const vacancyByCategory = new Map<string, typeof abr.vacancy>();
  for (const v of abr.vacancy) {
    const list = vacancyByCategory.get(v.category) ?? [];
    list.push(v);
    vacancyByCategory.set(v.category, list);
  }
  const vacancyCategories = [...vacancyByCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  async function finalize() {
    "use server";
    await finalizeNkAbrechnungAction(id);
    revalidatePath(`/service-charges/${id}`);
  }
  async function unfinalize() {
    "use server";
    await unfinalizeNkAbrechnungAction(id);
    revalidatePath(`/service-charges/${id}`);
  }
  async function recompute() {
    "use server";
    const res = await recomputeNkAbrechnungAction(id);
    revalidatePath("/service-charges");
    if (res.ok && res.data) {
      redirect(`/service-charges/${res.data.id}`);
    }
    redirect("/service-charges");
  }
  async function handleDelete() {
    "use server";
    await deleteNkAbrechnungAction(id);
    redirect("/service-charges");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">NK-Abrechnung {abr.year}</h1>
            <Badge variant={isFinalized ? "success" : "secondary"}>
              {isFinalized ? "Final" : "Entwurf"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {abr.property.street}, {abr.property.postalCode} {abr.property.city}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {!isFinalized && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/service-charges/${id}/edit`}>
                  <Pencil className="size-4" />
                  Bearbeiten
                </Link>
              </Button>
              <form action={recompute}>
                <Button type="submit" variant="outline" size="sm">
                  <RotateCcw className="size-4" />
                  Neu berechnen
                </Button>
              </form>
              <form action={finalize}>
                <Button type="submit" variant="outline" size="sm">
                  <CheckCircle2 className="size-4" />
                  Finalisieren
                </Button>
              </form>
            </>
          )}
          {isFinalized && (
            <form action={unfinalize}>
              <Button type="submit" variant="outline" size="sm">
                <Undo2 className="size-4" />
                Entfinalisieren
              </Button>
            </form>
          )}
          <form action={handleDelete}>
            <Button type="submit" variant="destructive" size="sm">
              <Trash2 className="size-4" />
              Löschen
            </Button>
          </form>
        </div>
      </div>

      {/* KPI */}
      <div className={`grid grid-cols-1 gap-3 sm:gap-4 ${totalLeerstand > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Kosten gesamt</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(totalKosten)}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Vorauszahlungen</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(totalVorausz)}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Saldo gesamt</p>
          <p className={`text-lg font-bold tabular-nums ${totalSaldo > 0 ? "text-amber-600" : totalSaldo < 0 ? "text-emerald-600" : ""}`}>
            {formatMoney(totalSaldo)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalSaldo > 0 ? "Nachzahlung" : totalSaldo < 0 ? "Erstattung" : "ausgeglichen"}
          </p>
        </div>
        {totalLeerstand > 0 && (
          <div className="rounded-xl border bg-card px-4 py-3 border-amber-500/30 bg-amber-500/5">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <HomeIcon className="size-3" />
              Leerstand (Vermieter)
            </p>
            <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">{formatMoney(totalLeerstand)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              eigener Kostenanteil, nicht umgelegt
            </p>
          </div>
        )}
      </div>

      {/* Mieter-Karten */}
      <section>
        <h2 className="text-base font-semibold mb-3">Pro Mietverhältnis</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {abr.leaseAbrechnungen.map((la) => {
            const tenants = la.lease.leaseTenants.map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`).join(" · ");
            const saldoColor = la.saldoCents > 0 ? "text-amber-600" : la.saldoCents < 0 ? "text-emerald-600" : "";
            return (
              <Link
                key={la.id}
                href={`/service-charges/${id}/${la.id}`}
                className="block rounded-xl border bg-card p-5 hover:border-foreground/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{la.unit.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      <Private>{tenants}</Private>
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {la.monthsActive}/12 Mon.
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Kosten</p>
                    <p className="font-medium tabular-nums">{formatMoney(la.kostenAnteilCents)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Vorausz.</p>
                    <p className="font-medium tabular-nums">{formatMoney(la.vorauszahlungenCents)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saldo</p>
                    <p className={`font-semibold tabular-nums ${saldoColor}`}>{formatMoney(la.saldoCents)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span>{la.positionen.length} Positionen</span>
                  <span className="flex items-center gap-1 text-primary">
                    Details <ArrowRight className="size-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        {abr.leaseAbrechnungen.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Keine Mietverhältnisse im Abrechnungszeitraum aktiv.
          </p>
        )}
      </section>

      {/* Leerstand-Anteile pro Kategorie */}
      {vacancyCategories.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <HomeIcon className="size-4 text-amber-600" />
                Leerstand-Anteile
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Kostenanteil nicht vermieteter Monate — trägt der Vermieter (§ 556a BGB, BGH-Rechtsprechung).
              </p>
            </div>
            <p className="text-sm tabular-nums">
              <span className="text-muted-foreground">Σ </span>
              <span className="font-semibold text-amber-700 dark:text-amber-400">{formatMoney(totalLeerstand)}</span>
            </p>
          </div>
          <div className="rounded-xl border overflow-x-auto bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="text-left px-4 py-2.5 font-medium">Kategorie</th>
                  <th className="text-left px-4 py-2.5 font-medium">Wohneinheit</th>
                  <th className="text-right px-4 py-2.5 font-medium">Leerstand</th>
                  <th className="text-right px-4 py-2.5 font-medium">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {vacancyCategories.flatMap(([cat, rows]) =>
                  rows.map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium">
                        {CATEGORY_LABELS[cat as ExpenseCategory] ?? cat}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {v.unit.name}
                        <span className="ml-2 text-xs text-muted-foreground/70">{v.basisLabel ?? ""}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                        {v.vacantMonths}/12 Mon.
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {formatMoney(v.vacancyShareCents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
