import Link from "next/link";
import { listNkAbrechnungenAction } from "@/server/actions/service-charges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Private } from "@/components/private";
import { formatMoney } from "@/lib/money";
import { Plus, FileText, Building2 } from "lucide-react";

export const metadata = { title: "NK-Abrechnungen – Domora" };

export default async function NkAbrechnungenListPage() {
  const list = await listNkAbrechnungenAction();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nebenkostenabrechnungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pro Objekt und Jahr · automatische Verteilung umlegbarer Betriebskosten
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/service-charges/new">
            <Plus className="size-4" />
            Neue Abrechnung
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <FileText className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Noch keine Abrechnungen erstellt.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/service-charges/new">Erste Abrechnung erstellen</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((a) => {
            const totalKosten = a.leaseAbrechnungen.reduce((s, la) => s + la.kostenAnteilCents, 0);
            const totalSaldo = a.leaseAbrechnungen.reduce((s, la) => s + la.saldoCents, 0);
            return (
              <Link
                key={a.id}
                href={`/service-charges/${a.id}`}
                className="block rounded-xl border bg-card p-5 hover:border-foreground/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold truncate">{a.property.street}</h2>
                      <p className="text-xs text-muted-foreground">{a.property.city}</p>
                    </div>
                  </div>
                  <Badge variant={a.status === "finalized" ? "success" : "secondary"} className="shrink-0">
                    {a.status === "finalized" ? "Final" : "Entwurf"}
                  </Badge>
                </div>
                <p className="text-2xl font-bold tabular-nums mb-1">{a.year}</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Mieter</p>
                    <p className="font-medium">{a.leaseAbrechnungen.length}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Kosten</p>
                    <p className="font-medium tabular-nums">{formatMoney(totalKosten)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saldo</p>
                    <p className={`font-medium tabular-nums ${totalSaldo > 0 ? "text-amber-600" : totalSaldo < 0 ? "text-emerald-600" : ""}`}>
                      {formatMoney(totalSaldo)}
                    </p>
                  </div>
                </div>
                {a.leaseAbrechnungen.length > 0 && (
                  <div className="mt-3 pt-3 border-t text-xs text-muted-foreground truncate">
                    {a.leaseAbrechnungen.map((la, i) => (
                      <span key={la.id}>
                        {i > 0 && " · "}
                        <Private>
                          {la.lease.leaseTenants.map((lt) => `${lt.tenant.lastName}`).join("/")}
                        </Private>
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
