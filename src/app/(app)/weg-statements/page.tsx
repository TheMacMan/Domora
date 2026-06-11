import Link from "next/link";
import { listWegAbrechnungenAction } from "@/server/actions/weg-statements";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Plus, Building2, FileText } from "lucide-react";

export const metadata = { title: "WEG-Abrechnungen – Domora" };

export default async function WegAbrechnungenListPage() {
  const list = await listWegAbrechnungenAction();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WEG-Abrechnungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Jahresabrechnungen der Eigentümergemeinschaft — separat erfasst, fließen in Anlage V und NK-Abrechnung
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/weg-statements/new">
            <Plus className="size-4" />
            Neue Abrechnung
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <FileText className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Noch keine WEG-Abrechnungen erfasst.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/weg-statements/new">Erste Abrechnung erfassen</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((a) => {
            const saldoLabel = a.saldoCents > 0 ? "Nachzahlung" : a.saldoCents < 0 ? "Erstattung" : "Ausgeglichen";
            const saldoColor = a.saldoCents > 0 ? "text-amber-600" : a.saldoCents < 0 ? "text-emerald-600" : "";
            return (
              <Link
                key={a.id}
                href={`/weg-statements/${a.id}`}
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
                  <Badge variant="secondary">{a.year}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Hausgeld</p>
                    <p className="font-medium tabular-nums">{formatMoney(a.hausgeldVorauszahlungCents)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saldo</p>
                    <p className={`font-medium tabular-nums ${saldoColor}`}>{formatMoney(a.saldoCents)}</p>
                    <p className="text-[10px] text-muted-foreground">{saldoLabel}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Abr.-Datum</p>
                    <p className="font-medium tabular-nums">{formatDate(a.abrechnungsDatum)}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
