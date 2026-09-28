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
  // Ausgaben ohne verknüpften Beleg je Buchungsjahr
  missingReceipts?: Array<{ year: number; count: number; cents: number }>;
  // Fahrzeugjahre mit Fahrten, deren km-Satz mangels km-Stand vorläufig ist (abgeschlossene Jahre)
  provisionalVehicleYears?: Array<{ vehicleId: string; label: string; year: number }>;
  // Fahrzeugkosten ohne Beleg je Jahr (ab Bagatellgrenze)
  vehicleCostsMissingReceipts?: Array<{ year: number; count: number; cents: number }>;
  // Objekte, die sehr häufig angefahren werden (Hinweis regelmäßige Tätigkeitsstätte)
  frequentDestinations?: Array<{ propertyId: string; label: string; year: number; count: number }>;
  // Datensicherung: Zustand und Zeitpunkt der letzten Sicherung
  backup?: { health: "ok" | "stale" | "failed" | "missing"; finishedAt: string | null; message: string };
  // Zwischenzähler
  meters?: {
    openSettlements: Array<{ id: string; propertyId: string; number: string; direction: "refund" | "charge"; cents: number; createdAt: string; recipient: string }>;
    missingPrices: Array<{ leaseId: string; propertyId: string; label: string }>;
    missingYearEnd: Array<{ meterId: string; propertyId: string; name: string; year: number }>;
    calibration: Array<{ propertyId: string; name: string; until: string }>;
  };
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

  // Ausgaben ohne Beleg — Vorjahr ist für die Steuererklärung relevant, laufendes Jahr nur Hinweis
  const currentYear = parseInt(input.today.slice(0, 4), 10);
  for (const r of input.missingReceipts ?? []) {
    if (r.count <= 0) continue;
    tasks.push({
      id: `receipts-${r.year}`,
      severity: r.year < currentYear ? "warning" : "info",
      title: `${r.count} ${r.count === 1 ? "Ausgabe" : "Ausgaben"} ${r.year} ohne Beleg`,
      detail: "ab 20 € je Buchung · Rechnung oder Bon hochladen und verknüpfen — ohne Beleg nicht in die Steuererklärung übernehmen",
      href: `/expenses?year=${r.year}&beleg=missing`,
      amountCents: r.cents,
    });
  }

  if (input.backup && input.backup.health !== "ok") {
    const b = input.backup;
    tasks.push({
      id: "backup",
      severity: b.health === "stale" ? "warning" : "urgent",
      title: b.health === "missing" ? "Keine Datensicherung gefunden" : b.health === "failed" ? "Datensicherung fehlgeschlagen" : "Datensicherung veraltet",
      detail: b.health === "missing"
        ? "Nächtliche Sicherung prüfen (scripts/backup.sh, Cron 02:15)"
        : `Letzter Lauf ${b.finishedAt ? fmtDate(b.finishedAt.slice(0, 10)) : "–"}${b.health === "failed" ? ` · ${b.message}` : ""} · NAS-Freigabe und Cron prüfen`,
      href: "/settings",
    });
  }

  const m = input.meters;
  for (const s of m?.openSettlements ?? []) {
    const age = daysBetween(s.createdAt, input.today);
    tasks.push({
      id: `el-${s.id}`,
      severity: s.direction === "charge" && age > 21 ? "warning" : "info",
      title: s.direction === "refund" ? `Stromerstattung ${s.number} an ${s.recipient} überweisen` : `Stromrechnung ${s.number} an ${s.recipient} offen`,
      detail: s.direction === "refund" ? "Nach der Überweisung als bezahlt markieren — erst dann wird gebucht" : `seit ${age} Tagen · Zahlungseingang als bezahlt markieren`,
      href: `/properties/${s.propertyId}/meters`,
      amountCents: s.cents,
    });
  }
  for (const p of m?.missingPrices ?? []) {
    tasks.push({
      id: `price-${p.leaseId}`,
      severity: "warning",
      title: `Strompreis fehlt: ${p.label}`,
      detail: "Arbeitspreis aus der Stromrechnung des Mieters eintragen — sonst keine Zwischenzähler-Abrechnung",
      href: `/properties/${p.propertyId}/meters`,
    });
  }
  const ye = m?.missingYearEnd ?? [];
  if (ye.length > 0) {
    tasks.push({
      id: "meter-year-end",
      severity: "warning",
      title: `Zählerstände zum 31.12.${ye[0]!.year} erfassen`,
      detail: ye.map((x) => x.name).join(", "),
      href: `/properties/${ye[0]!.propertyId}/meters`,
    });
  }
  for (const c of m?.calibration ?? []) {
    tasks.push({
      id: `calib-${c.name}`,
      severity: "info",
      title: `Eichfrist ${c.name} endet ${fmtDate(c.until)}`,
      detail: "Zähler tauschen bzw. eichen lassen",
      href: `/properties/${c.propertyId}/meters`,
    });
  }

  for (const v of input.provisionalVehicleYears ?? []) {
    tasks.push({
      id: `odometer-${v.vehicleId}-${v.year}`,
      severity: "warning",
      title: `km-Stand ${v.year} fehlt: ${v.label}`,
      detail: `Fahrtkosten ${v.year} sind nur vorläufig (geschätzte km) · km-Stand zum 01.01. und 31.12. erfassen oder Pauschale 0,30 €/km wählen`,
      href: `/expenses/vehicles/${v.vehicleId}?year=${v.year}`,
    });
  }

  for (const r of input.vehicleCostsMissingReceipts ?? []) {
    if (r.count <= 0) continue;
    tasks.push({
      id: `vehicle-receipts-${r.year}`,
      severity: r.year < currentYear ? "warning" : "info",
      title: `${r.count} ${r.count === 1 ? "Fahrzeugkosten-Posten" : "Fahrzeugkosten-Posten"} ${r.year} ohne Beleg`,
      detail: "Leasing, Versicherung, Reifen … — die Kosten bestimmen den km-Satz und müssen belegt sein",
      href: "/expenses/trips#fahrzeuge",
      amountCents: r.cents,
    });
  }

  for (const f of input.frequentDestinations ?? []) {
    tasks.push({
      id: `frequent-${f.propertyId}-${f.year}`,
      severity: "info",
      title: `${f.count} Fahrten ${f.year} zu ${f.label}`,
      detail: "Sehr häufige Fahrten: Prüfen, ob das Objekt als regelmäßige Tätigkeitsstätte gilt (dann nur Entfernungspauschale)",
      href: `/expenses/trips?year=${f.year}`,
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
