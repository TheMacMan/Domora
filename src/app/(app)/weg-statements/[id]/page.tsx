import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWegAbrechnungAction, deleteWegAbrechnungAction } from "@/server/actions/weg-statements";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { CATEGORY_LABELS, isOperatingCost } from "@/lib/expense";
import { ArrowLeft, Trash2, Pencil } from "lucide-react";

export const metadata = { title: "WEG-Abrechnung – Domora" };

export default async function WegAbrechnungDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abr = await getWegAbrechnungAction(id);
  if (!abr) notFound();

  async function handleDelete() {
    "use server";
    await deleteWegAbrechnungAction(id);
    redirect("/weg-statements");
  }

  const positionsTotal = abr.positions
    .filter((p) => p.category !== "weg_saldo")
    .reduce((s, p) => s + p.amountCents, 0);

  // Gruppierung nach Verwendung
  type Group = { key: "umlagefaehig" | "nicht_umlagefaehig" | "ruecklage"; label: string; sub: string; positions: typeof abr.positions };
  const groups: Group[] = [
    { key: "umlagefaehig",      label: "Umlagefähige Kosten",     sub: "Anlage V + NK-Abrechnung", positions: [] },
    { key: "nicht_umlagefaehig", label: "Nicht umlagefähige Kosten", sub: "nur Anlage V",            positions: [] },
    { key: "ruecklage",         label: "Rücklagenzuführung",       sub: "Vermögensbildung",         positions: [] },
  ];
  for (const p of abr.positions) {
    if (p.category === "weg_saldo") continue;
    if (p.category === "weg_ruecklage") groups[2]!.positions.push(p);
    else if (isOperatingCost(p.category)) groups[0]!.positions.push(p);
    else groups[1]!.positions.push(p);
  }
  const subtotalOf = (g: Group) => g.positions.reduce((s, p) => s + p.amountCents, 0);

  const saldoLabel = abr.saldoCents > 0 ? "Nachzahlung" : abr.saldoCents < 0 ? "Erstattung" : "ausgeglichen";
  const saldoColor = abr.saldoCents > 0 ? "text-amber-600" : abr.saldoCents < 0 ? "text-emerald-600" : "";

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/weg-statements">
            <ArrowLeft className="size-4" />
            Zurück
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WEG-Abrechnung {abr.year}</h1>
            <p className="text-muted-foreground mt-1">
              {abr.property.street}, {abr.property.postalCode} {abr.property.city}
              {" · "}
              Abrechnungsdatum {formatDate(abr.abrechnungsDatum)}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button asChild variant="outline" size="sm">
              <Link href={`/weg-statements/${id}/edit`}>
                <Pencil className="size-4" />
                Bearbeiten
              </Link>
            </Button>
            <form action={handleDelete}>
              <Button type="submit" variant="destructive" size="sm">
                <Trash2 className="size-4" />
                Löschen
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Σ Posten</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(positionsTotal)}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">./. Hausgeld-Vorausz.</p>
          <p className="text-lg font-bold tabular-nums">{formatMoney(abr.hausgeldVorauszahlungCents)}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Saldo</p>
          <p className={`text-lg font-bold tabular-nums ${saldoColor}`}>{formatMoney(abr.saldoCents)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{saldoLabel}</p>
        </div>
      </div>

      {/* Positionen, gruppiert nach Verwendung */}
      <section className="space-y-5">
        {groups.filter((g) => g.positions.length > 0).map((g) => {
          const subtotal = subtotalOf(g);
          return (
            <div key={g.key}>
              <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold">{g.label}</h2>
                  <p className="text-xs text-muted-foreground">{g.sub}</p>
                </div>
                <p className="text-sm tabular-nums">
                  <span className="text-muted-foreground">Σ </span>
                  <span className="font-semibold">{formatMoney(subtotal)}</span>
                </p>
              </div>
              <div className="rounded-xl border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-b">
                      <th className="text-left px-4 py-2.5 font-medium">Kategorie</th>
                      <th className="text-left px-4 py-2.5 font-medium">Bezeichnung</th>
                      <th className="text-right px-4 py-2.5 font-medium">Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.positions.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">
                          {CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{p.description ?? "–"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatMoney(p.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="flex items-baseline justify-between gap-3 px-4 py-3 rounded-xl bg-muted/30 border">
          <p className="text-sm font-semibold">Σ alle Posten</p>
          <p className="text-base font-bold tabular-nums">{formatMoney(positionsTotal)}</p>
        </div>
      </section>

      {/* Hinweise */}
      <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Anlage V:</strong> Alle Posten außer Rücklage und Saldo werden als Werbungskosten geführt.</p>
        <p><strong className="text-foreground">NK-Abrechnung:</strong> Umlegbare Posten (Wasser, Müll, Hausmeister …) fließen automatisch in die NK-Abrechnung an deinen Mieter ein.</p>
        <p><strong className="text-foreground">Cashflow:</strong> Die Einzelposten erscheinen NICHT im Cashflow — dort wird der reale Geldfluss über monatliches Hausgeld + Saldo gezeigt.</p>
      </div>
    </div>
  );
}
