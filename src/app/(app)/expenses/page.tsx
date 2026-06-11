import Link from "next/link";
import { getExpensesAction } from "@/server/actions/expenses";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDate, formatMonthShort } from "@/lib/dates";
import { CATEGORY_LABELS, isOperatingCost } from "@/lib/expense";
import { ExpenseFilters } from "@/components/expense/expense-filters";
import { Plus, Pencil, RefreshCw, Calendar, ArrowUpRight, ArrowDownRight, Repeat } from "lucide-react";

export const metadata = { title: "Ausgaben – Domora" };

type Search = {
  year?: string;
  property?: string;
  category?: string;
  q?: string;
  sort?: string;
};

type Expense = Awaited<ReturnType<typeof getExpensesAction>>[number];

function sortKeyOf(e: Expense, mode: "date" | "period"): string {
  if (mode === "period" && e.servicePeriodStart) return e.servicePeriodStart;
  return e.date;
}

function yearOf(e: Expense, mode: "date" | "period"): number {
  if (mode === "period" && e.servicePeriodStart) {
    return parseInt(e.servicePeriodStart.slice(0, 4), 10);
  }
  return parseInt(e.date.slice(0, 4), 10);
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const filterYear = sp.year ?? "";
  const filterProperty = sp.property ?? "";
  const filterCategory = sp.category ?? "";
  const filterSearch = (sp.q ?? "").toLowerCase().trim();
  const sortMode: "date" | "period" = sp.sort === "period" ? "period" : "date";

  const all = await getExpensesAction();

  // Jahres-Liste für Pills (alle Jahre in den Daten — sowohl Buchungs- als auch Leistungsjahre)
  const yearsSet = new Set<number>();
  for (const e of all) {
    yearsSet.add(parseInt(e.date.slice(0, 4), 10));
    if (e.servicePeriodStart) yearsSet.add(parseInt(e.servicePeriodStart.slice(0, 4), 10));
    if (e.servicePeriodEnd) yearsSet.add(parseInt(e.servicePeriodEnd.slice(0, 4), 10));
  }
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  // Objekt-Liste für Dropdown
  const propertyMap = new Map<string, string>();
  for (const e of all) {
    if (e.property) propertyMap.set(e.property.id, `${e.property.street}, ${e.property.city}`);
  }
  const properties = Array.from(propertyMap.entries()).map(([id, label]) => ({ id, label }));

  // Filter anwenden
  const filtered = all.filter((e) => {
    if (filterYear) {
      const y = parseInt(filterYear, 10);
      const inBookingYear = e.date.startsWith(filterYear);
      const inPeriod = e.servicePeriodStart && e.servicePeriodEnd
        && parseInt(e.servicePeriodStart.slice(0, 4), 10) <= y
        && parseInt(e.servicePeriodEnd.slice(0, 4), 10) >= y;
      if (!inBookingYear && !inPeriod) return false;
    }
    if (filterProperty) {
      if (filterProperty === "none") {
        if (e.property) return false;
      } else if (e.propertyId !== filterProperty) return false;
    }
    if (filterCategory && e.category !== filterCategory) return false;
    if (filterSearch) {
      const hay = `${e.description ?? ""} ${CATEGORY_LABELS[e.category] ?? ""} ${e.notes ?? ""}`.toLowerCase();
      if (!hay.includes(filterSearch)) return false;
    }
    return true;
  });

  // Sortierung
  filtered.sort((a, b) => sortKeyOf(b, sortMode).localeCompare(sortKeyOf(a, sortMode)));

  // KPIs — beziehen sich auf die GEFILTERTE Liste, aber wenn ein Jahr ausgewählt ist auch nur dieses Jahr
  const totalAll = filtered.reduce((s, e) => s + e.amountCents, 0);
  const totalUmlegbar = filtered.filter((e) => isOperatingCost(e.category)).reduce((s, e) => s + e.amountCents, 0);
  const totalNichtUmlegbar = totalAll - totalUmlegbar;

  // Gruppierung nach Jahr (nach sortKey)
  const byYear = new Map<number, Expense[]>();
  for (const e of filtered) {
    const y = yearOf(e, sortMode);
    const list = byYear.get(y) ?? [];
    list.push(e);
    byYear.set(y, list);
  }
  const yearGroups = Array.from(byYear.entries()).sort(([a], [b]) => b - a);

  // Sollten wir die Objekt-Spalte ausblenden?
  const uniquePropertyIds = new Set(filtered.map((e) => e.propertyId ?? "null"));
  const hideObjektCol = uniquePropertyIds.size <= 1 && filtered.length > 0;

  const renderRow = (e: Expense) => (
    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
        {formatDate(e.date)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {e.scheduleId ? (
            <Repeat className="size-3 text-muted-foreground shrink-0" aria-label="Aus Abo generiert" />
          ) : e.isRecurring ? (
            <RefreshCw className="size-3 text-muted-foreground shrink-0" aria-label="Wiederkehrend" />
          ) : null}
          {e.description ? (
            <span className="font-medium">{e.description}</span>
          ) : (
            <span className="font-medium italic text-muted-foreground">{CATEGORY_LABELS[e.category]}</span>
          )}
        </div>
        {e.servicePeriodStart && e.servicePeriodEnd && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Calendar className="size-3 shrink-0" />
            Leistung {formatMonthShort(e.servicePeriodStart.slice(0, 7))} – {formatMonthShort(e.servicePeriodEnd.slice(0, 7))}
            <span className="ml-1 italic">(verteilt)</span>
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{CATEGORY_LABELS[e.category]}</td>
      {!hideObjektCol && (
        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-xs">
          {e.property ? e.property.street : "Alle Objekte"}
        </td>
      )}
      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(e.amountCents)}</td>
      <td className="px-4 py-3 text-right">
        <Button asChild variant="ghost" size="icon" title={e.scheduleId ? "Abo bearbeiten" : "Bearbeiten"}>
          <Link href={e.scheduleId ? `/expenses/recurring/${e.scheduleId}/edit` : `/expenses/${e.id}/edit`}>
            {e.scheduleId ? <Repeat className="size-4" /> : <Pencil className="size-4" />}
          </Link>
        </Button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ausgaben</h1>
          {all.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {all.length} {all.length === 1 ? "Eintrag" : "Einträge"} gesamt
              {hideObjektCol && filtered[0]?.property && (
                <> · {filtered[0].property.street}, {filtered[0].property.city}</>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses/recurring">
              <Repeat className="size-4" />
              Abos
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/expenses/new">
              <Plus className="size-4" />
              Neue Ausgabe
            </Link>
          </Button>
        </div>
      </div>

      {all.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground rounded-xl border border-dashed">
          <p>Noch keine Ausgaben erfasst.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/expenses/new">Erste Ausgabe erfassen</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Filter */}
          <ExpenseFilters
            years={years}
            properties={properties}
            currentYear={filterYear}
            currentProperty={filterProperty}
            currentCategory={filterCategory}
            currentSearch={sp.q ?? ""}
            currentSort={sortMode}
          />

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Σ Gefiltert</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totalAll)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} Einträge</p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1 text-amber-600">
                <ArrowUpRight className="size-3.5" />
                <p className="text-xs">Umlegbar (BetrKV)</p>
              </div>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totalUmlegbar)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">an Mieter umlegbar</p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1 text-emerald-600">
                <ArrowDownRight className="size-3.5" />
                <p className="text-xs">Nicht umlegbar</p>
              </div>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totalNichtUmlegbar)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">nur Werbungskosten</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Keine Einträge entsprechen den Filtern.
            </div>
          ) : (
            <div className="space-y-4">
              {yearGroups.map(([year, list], idx) => {
                const groupSum = list.reduce((s, e) => s + e.amountCents, 0);
                return (
                  <details key={year} open={idx === 0 || yearGroups.length === 1} className="group rounded-xl border bg-card overflow-hidden">
                    <summary className="cursor-pointer px-4 py-3 bg-muted/30 hover:bg-muted/50 flex items-center justify-between gap-3 list-none">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground transition-transform group-open:rotate-90">▶</span>
                        <span className="font-semibold tabular-nums">{year}</span>
                        <span className="text-xs text-muted-foreground">{list.length} Einträge</span>
                      </div>
                      <span className="font-medium tabular-nums">{formatMoney(groupSum)}</span>
                    </summary>

                    {/* Mobile */}
                    <div className="space-y-2 p-3 md:hidden">
                      {list.map((e) => (
                        <Link
                          key={e.id}
                          href={`/expenses/${e.id}/edit`}
                          className="block rounded-lg border px-4 py-3 active:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate flex items-center gap-1.5">
                                {e.isRecurring && <RefreshCw className="size-3 text-muted-foreground shrink-0" />}
                                {e.description ? e.description : <span className="italic text-muted-foreground">{CATEGORY_LABELS[e.category]}</span>}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(e.date)}
                                {e.description && <> · {CATEGORY_LABELS[e.category]}</>}
                              </p>
                            </div>
                            <p className="text-right tabular-nums font-semibold shrink-0">{formatMoney(e.amountCents)}</p>
                          </div>
                          {!hideObjektCol && (
                            <p className="text-xs text-muted-foreground truncate">
                              {e.property ? `${e.property.street}, ${e.property.city}` : "Alle Objekte"}
                            </p>
                          )}
                          {e.servicePeriodStart && e.servicePeriodEnd && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Calendar className="size-3 shrink-0" />
                              {formatMonthShort(e.servicePeriodStart.slice(0, 7))} – {formatMonthShort(e.servicePeriodEnd.slice(0, 7))} <span className="italic">(verteilt)</span>
                            </p>
                          )}
                        </Link>
                      ))}
                    </div>

                    {/* Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20">
                          <tr className="border-b">
                            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Datum</th>
                            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Beschreibung</th>
                            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Kategorie</th>
                            {!hideObjektCol && (
                              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Objekt</th>
                            )}
                            <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Betrag</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {list.map(renderRow)}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
