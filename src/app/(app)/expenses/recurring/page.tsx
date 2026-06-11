import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  getExpenseSchedulesAction,
  deleteExpenseScheduleAction,
} from "@/server/actions/expense-schedules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { CATEGORY_LABELS } from "@/lib/expense";
import { Plus, Pencil, Trash2, Repeat, ArrowLeft } from "lucide-react";

export const metadata = { title: "Abos – Domora" };

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mär",
    "Apr",
    "Mai",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Okt",
    "Nov",
    "Dez",
  ];
  return `${monthNames[parseInt(m!, 10) - 1]} ${y}`;
}

export default async function ExpenseSchedulesPage() {
  const schedules = await getExpenseSchedulesAction();
  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  async function handleDelete(id: string) {
    "use server";
    await deleteExpenseScheduleAction(id);
    revalidatePath("/expenses/recurring");
    revalidatePath("/expenses");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/expenses">
              <ArrowLeft className="size-4" />
              Zurück zu Ausgaben
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Abos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monatlich wiederkehrende Ausgaben (z. B. Hausgeld). Generiert automatisch eine
            Buchung pro Monat.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/expenses/recurring/new">
            <Plus className="size-4" />
            Neues Abo
          </Link>
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Repeat className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Noch keine Abos angelegt.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/expenses/recurring/new">Erstes Abo anlegen</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const ended = s.endMonth && s.endMonth < thisMonth;
            const future = s.startMonth > thisMonth;
            return (
              <div
                key={s.id}
                className="rounded-xl border bg-card p-4 flex items-start justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">
                      {s.description || CATEGORY_LABELS[s.category]}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {CATEGORY_LABELS[s.category]}
                    </Badge>
                    {ended ? (
                      <Badge variant="outline" className="text-[10px]">
                        Beendet
                      </Badge>
                    ) : future ? (
                      <Badge variant="warning" className="text-[10px]">
                        Geplant
                      </Badge>
                    ) : (
                      <Badge variant="success" className="text-[10px]">
                        Aktiv
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.property
                      ? `${s.property.street}, ${s.property.city}`
                      : "Alle Objekte (anteilig)"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatMonth(s.startMonth)} –{" "}
                    {s.endMonth ? formatMonth(s.endMonth) : "laufend"} · Tag {s.dayOfMonth}.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-base font-semibold tabular-nums">
                    {formatMoney(s.amountCents)}
                    <span className="text-xs font-normal text-muted-foreground">/Mon.</span>
                  </p>
                  <div className="flex gap-1">
                    <Button asChild variant="ghost" size="iconSm">
                      <Link href={`/expenses/recurring/${s.id}/edit`} title="Bearbeiten">
                        <Pencil className="size-3.5" />
                      </Link>
                    </Button>
                    <form action={handleDelete.bind(null, s.id)}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="iconSm"
                        className="text-muted-foreground hover:text-destructive"
                        title="Abo löschen (mit allen offenen Buchungen)"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
