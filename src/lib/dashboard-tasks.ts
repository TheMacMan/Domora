// Aufgabenliste für das Dashboard: was gerade zu tun ist. Reine Funktion, Beträge in Cents.

import type { FixedRateItem } from "@/lib/loan-projection";

export type TaskSeverity = "urgent" | "warning" | "info";

export type DashboardTask = {
  id: string;
  severity: TaskSeverity;
  title: string;
  detail: string;
  href: string;
  amountCents?: number;
};

export type TaskInput = {
  today: string; // YYYY-MM-DD
  fixedRates: FixedRateItem[];
  // Mietverträge mit fälligen Monaten ohne Soll-Stellung (Monate als YYYY-MM)
  missingDues: Array<{ leaseId: string; label: string; months: string[] }>;
  // Rückstände je Vertrag (fällige Monate, Soll − Ist)
  arrears: Array<{ leaseId: string; label: string; cents: number; year: number }>;
  endingLeases: Array<{ leaseId: string; label: string; endDate: string }>;
  // Objekte mit NK-Vorauszahlungen, für die die Abrechnung eines Jahres fehlt
  missingNkStatements: Array<{ propertyId: string; label: string; year: number }>;
};

const SEVERITY_ORDER: Record<TaskSeverity, number> = { urgent: 0, warning: 1, info: 2 };

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${m}/${y}`;
}

function daysBetween(from: string, to: string) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function buildDashboardTasks(input: TaskInput): DashboardTask[] {
  const tasks: DashboardTask[] = [];

  // Zinsbindungen, die abgelaufen sind oder in < 6 Monaten auslaufen
  for (const f of input.fixedRates) {
    if ((f.status !== "urgent" && f.status !== "expired") || !f.fixedUntil) continue;
    const days = daysBetween(input.today, f.fixedUntil);
    tasks.push({
      id: `fixed-${f.id}`,
      severity: days <= 30 ? "urgent" : "warning",
      title: f.status === "expired"
        ? `Zinsbindung abgelaufen: ${f.description}`
        : `Zinsbindung endet ${days <= 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`}: ${f.description}`,
      detail: `${f.contractNumber ? `Vertrag ${f.contractNumber} · ` : ""}bis ${fmtDate(f.fixedUntil)} · Anschlussfinanzierung oder Ablösung klären`,
      href: `/loans/${f.id}`,
      amountCents: f.balanceAtEndCents ?? undefined,
    });
  }

  // Fällige Monate ohne Soll-Stellung
  const missingMonths = [...new Set(input.missingDues.flatMap((m) => m.months))].sort();
  if (missingMonths.length > 0) {
    const first = missingMonths[0]!;
    tasks.push({
      id: "missing-dues",
      severity: "warning",
      title: missingMonths.length === 1
        ? `Mieten ${fmtMonth(first)} noch nicht erzeugt`
        : `Mieten für ${missingMonths.length} Monate noch nicht erzeugt`,
      detail: `${input.missingDues.length} ${input.missingDues.length === 1 ? "Vertrag" : "Verträge"} · ab ${fmtMonth(first)} — ohne Soll-Stellung fehlen die Beträge in Übersicht und Rückständen`,
      href: `/payments?month=${first}`,
    });
  }

  // Rückstände
  for (const a of input.arrears) {
    if (a.cents <= 0) continue;
    tasks.push({
      id: `arrears-${a.leaseId}-${a.year}`,
      severity: "warning",
      title: `Mietrückstand ${a.label}`,
      detail: `offene Beträge aus ${a.year}`,
      href: `/payments/overview?year=${a.year}`,
      amountCents: a.cents,
    });
  }

  // Fehlende NK-Abrechnungen (Frist: 12 Monate nach Ende des Abrechnungsjahres, § 556 Abs. 3 BGB)
  for (const n of input.missingNkStatements) {
    const deadline = `${n.year + 1}-12-31`;
    const days = daysBetween(input.today, deadline);
    tasks.push({
      id: `nk-${n.propertyId}-${n.year}`,
      severity: days < 0 ? "info" : days <= 92 ? "urgent" : "info",
      title: days < 0 ? `NK-Abrechnung ${n.year} nicht erstellt (Frist abgelaufen)` : `NK-Abrechnung ${n.year} erstellen`,
      detail: days < 0
        ? `${n.label} · Nachforderungen sind ausgeschlossen, Guthaben der Mieter bleiben erstattungspflichtig`
        : `${n.label} · Frist ${fmtDate(deadline)} (noch ${days} Tage)`,
      href: "/service-charges",
    });
  }

  // Verträge, die in den nächsten 60 Tagen enden
  for (const l of input.endingLeases) {
    const days = daysBetween(input.today, l.endDate);
    if (days < 0 || days > 60) continue;
    tasks.push({
      id: `ending-${l.leaseId}`,
      severity: "info",
      title: `Vertrag endet ${days === 0 ? "heute" : `in ${days} Tagen`}: ${l.label}`,
      detail: `zum ${fmtDate(l.endDate)} · Übergabe, Kaution und Anschlussvermietung planen`,
      href: `/leases/${l.leaseId}`,
    });
  }

  return tasks.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
