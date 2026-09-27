import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { Private } from "@/components/private";
import { formatMoney } from "@/lib/money";
import type { DashboardTask, TaskSeverity } from "@/lib/dashboard-tasks";

const STYLE: Record<TaskSeverity, { icon: React.ReactNode; dot: string }> = {
  urgent:  { icon: <AlertTriangle className="size-4 text-destructive" />, dot: "bg-red-500" },
  warning: { icon: <AlertTriangle className="size-4 text-amber-500" />, dot: "bg-amber-500" },
  info:    { icon: <Info className="size-4 text-muted-foreground" />, dot: "bg-muted-foreground" },
};

// „Zu tun" — Aufgaben aus Darlehen, Zahlungen, Verträgen und NK-Abrechnungen
export function DashboardTasks({ tasks }: { tasks: DashboardTask[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold">Zu tun</h2>
        {tasks.length > 0 && <span className="text-xs text-muted-foreground">{tasks.length} {tasks.length === 1 ? "Punkt" : "Punkte"}</span>}
      </div>
      {tasks.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-5">
          <CheckCircle2 className="size-4 text-green-600" />
          Alles erledigt — keine offenen Punkte.
        </div>
      ) : (
        <ul className="divide-y">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5">
                <span className="mt-0.5 shrink-0">{STYLE[t.severity].icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium"><Private>{t.title}</Private></span>
                  <span className="block text-xs text-muted-foreground"><Private>{t.detail}</Private></span>
                </span>
                {t.amountCents != null && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums"><Private>{formatMoney(t.amountCents)}</Private></span>
                )}
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
