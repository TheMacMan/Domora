import Link from "next/link";
import { notFound } from "next/navigation";
import { getNkAbrechnungAction } from "@/server/actions/service-charges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Private } from "@/components/private";
import { CATEGORY_LABELS } from "@/lib/expense";
import { DISTRIBUTION_LABELS } from "@/lib/nk-abrechnung";
import { formatMoney } from "@/lib/money";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata = { title: "NK-Abrechnung Mietverhältnis – Domora" };

export default async function NkLeaseDetailPage({ params }: { params: Promise<{ id: string; leaseAbrId: string }> }) {
  const { id, leaseAbrId } = await params;
  const abr = await getNkAbrechnungAction(id);
  if (!abr) notFound();
  const la = abr.leaseAbrechnungen.find((x) => x.id === leaseAbrId);
  if (!la) notFound();

  const tenants = la.lease.leaseTenants.map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`).join(" · ");
  const saldoColor = la.saldoCents > 0 ? "text-amber-600" : la.saldoCents < 0 ? "text-emerald-600" : "";
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/service-charges/${id}`}>
            <ArrowLeft className="size-4" />
            Zurück zur Abrechnung
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{la.unit.name} – {abr.year}</h1>
        <p className="text-muted-foreground mt-1">
          <Private>{tenants}</Private>
          {" · "}
          {abr.property.street}, {abr.property.city}
          {" · "}
          {la.monthsActive}/12 Monate aktiv
        </p>
      </div>

      {/* Positionen-Tabelle */}
      <section>
        <h2 className="text-base font-semibold mb-3">Positionen</h2>
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="text-left px-4 py-3 font-medium">Kategorie</th>
                <th className="text-right px-4 py-3 font-medium">Gesamtkosten</th>
                <th className="text-left px-4 py-3 font-medium">Schlüssel</th>
                <th className="text-left px-4 py-3 font-medium">Basis</th>
                <th className="text-right px-4 py-3 font-medium">Dein Anteil</th>
              </tr>
            </thead>
            <tbody>
              {la.positionen.map((p) => {
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS]}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMoney(p.totalCostsCents)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px]">{DISTRIBUTION_LABELS[p.distributionKey]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.basisLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(p.shareCents)}</td>
                  </tr>
                );
              })}
              {la.positionen.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Keine umlegbaren Betriebskosten für diesen Zeitraum gefunden.
                  </td>
                </tr>
              )}
              {la.positionen.length > 0 && (
                <tr className="bg-muted/20 font-medium">
                  <td className="px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground" colSpan={4}>Σ Kosten</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(la.kostenAnteilCents)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Abrechnung */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Anteil Kosten</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(la.kostenAnteilCents)}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Vorauszahlungen (Soll)</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(la.vorauszahlungenCents)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{la.monthsActive} Monate</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Saldo</p>
          <p className={`text-lg font-bold tabular-nums ${saldoColor}`}>{formatMoney(la.saldoCents)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {la.saldoCents > 0 ? "Nachzahlung Mieter" : la.saldoCents < 0 ? "Erstattung an Mieter" : "ausgeglichen"}
          </p>
        </div>
      </section>

      <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Verteilerschlüssel ändern:</strong> in Phase 2. Aktuell werden die Default-Schlüssel angewandt.</p>
        <p><strong className="text-foreground">Einsichtsrecht:</strong> der Mieter hat ein Recht auf Einsicht in die Originalbelege. Die 12-Monats-Frist nach Ende des Abrechnungszeitraums läuft.</p>
      </div>

      <Button asChild variant="outline">
        <a href={`/api/service-charges/${id}/${leaseAbrId}/pdf`} download>
          <FileText className="size-4" />
          PDF erzeugen
        </a>
      </Button>
    </div>
  );
}
