import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPropertyAction, deletePropertyAction } from "@/server/actions/properties";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const metadata = { title: "Objekt – Domora" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2.5 border-b last:border-0 gap-4">
      <dt className="text-sm text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm text-right">{value ?? "–"}</dd>
    </div>
  );
}

function floorLabel(floor: number | null | undefined) {
  if (floor == null) return null;
  if (floor === 0) return "EG";
  if (floor < 0) return `UG${Math.abs(floor)}`;
  return `${floor}. OG`;
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getPropertyAction(id);

  if (!property || property.deletedAt) notFound();

  const gebaeudanteil =
    property.purchasePriceTotal != null && property.purchasePriceLand != null
      ? property.purchasePriceTotal - property.purchasePriceLand
      : null;

  const totalArea = property.units.reduce((s, u) => s + u.livingArea, 0);
  const afaBase = gebaeudanteil ?? property.purchasePriceTotal;
  const afaPerYear = afaBase != null ? Math.round(afaBase * property.depreciationPermille) / 1000 : null;

  async function handleDelete() {
    "use server";
    await deletePropertyAction(id);
    revalidatePath("/properties");
    redirect("/properties");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{property.street}</h1>
          <p className="text-muted-foreground mt-1">{property.postalCode} {property.city}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`/properties/${id}/edit`}>
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

      {/* Stammdaten */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-5 py-3 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stammdaten</p>
        </div>
        <dl className="px-6 py-2">
          <Row label="Baujahr" value={property.yearBuilt} />
          <Row label="Anschaffungsdatum" value={formatDate(property.purchaseDate)} />
          <Row label="Kaufpreis gesamt" value={property.purchasePriceTotal != null ? formatMoney(property.purchasePriceTotal) : null} />
          <Row label="davon Grundstück" value={property.purchasePriceLand != null ? formatMoney(property.purchasePriceLand) : null} />
          <Row label="davon Gebäude" value={gebaeudanteil != null ? formatMoney(gebaeudanteil) : null} />
          {property.notes && <Row label="Notizen" value={<span className="whitespace-pre-wrap">{property.notes}</span>} />}
        </dl>
      </div>

      {/* AfA-Berechnung */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-5 py-3 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abschreibung (AfA)</p>
        </div>
        <dl className="px-6 py-2">
          <Row
            label="AfA-Satz"
            value={`${(property.depreciationPermille / 10).toLocaleString("de-DE", { minimumFractionDigits: 1 })} % (linear)`}
          />
          <Row
            label="AfA-Basis"
            value={afaBase != null ? formatMoney(afaBase) : <span className="text-xs text-muted-foreground">Kaufpreis nicht vollständig</span>}
          />
          <Row
            label="AfA pro Jahr"
            value={afaPerYear != null ? formatMoney(afaPerYear) : null}
          />
          <Row
            label="AfA pro Monat"
            value={afaPerYear != null ? formatMoney(Math.round(afaPerYear / 12)) : null}
          />
        </dl>
      </div>

      {/* Wohneinheiten – kompakte Übersicht */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Wohneinheiten</h2>
            {property.units.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {property.units.length} Einheit{property.units.length !== 1 ? "en" : ""} ·{" "}
                {totalArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m² gesamt
              </p>
            )}
          </div>
          <Button asChild size="sm">
            <Link href={`/properties/${id}/units/new`}>
              <Plus className="size-4" />
              Wohneinheit
            </Link>
          </Button>
        </div>

        {property.units.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            Noch keine Wohneinheiten angelegt.
          </div>
        ) : (
          <div className="rounded-xl border overflow-x-auto bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Etage</th>
                  <th className="text-right px-4 py-3 font-medium">Fläche</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {property.units.map((unit) => (
                  <tr key={unit.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{unit.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {floorLabel(unit.floor) ?? "–"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {unit.livingArea.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="iconSm">
                        <Link href={`/properties/${id}/units/${unit.id}/edit`}>
                          <Pencil className="size-3.5" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/properties">← Alle Objekte</Link>
        </Button>
      </div>
    </div>
  );
}
