// Mieterübersicht: Status und maßgeblicher Vertrag je Mieter. Reine Funktionen.

export type TenantStatus = "active" | "future" | "ended" | "none";

export type TenantLeaseLike = {
  id: string;
  startDate: string;
  endDate: string | null;
};

// Maßgeblicher Vertrag: aktiver vor zukünftigem vor zuletzt beendetem
export function tenantStatus<L extends TenantLeaseLike>(
  leases: L[],
  today: string,
): { status: TenantStatus; lease: L | null } {
  const active = leases
    .filter((l) => l.startDate <= today && (l.endDate == null || l.endDate >= today))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (active.length > 0) return { status: "active", lease: active[0]! };

  const future = leases.filter((l) => l.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (future.length > 0) return { status: "future", lease: future[0]! };

  const ended = leases
    .filter((l) => l.endDate != null && l.endDate < today)
    .sort((a, b) => b.endDate!.localeCompare(a.endDate!));
  if (ended.length > 0) return { status: "ended", lease: ended[0]! };

  return { status: "none", lease: null };
}

// Mietdauer in Jahren/Monaten, z. B. „6 J. 5 M.“
export function tenancyDuration(start: string, end: string): string {
  const [sy, sm] = start.split("-").map(Number) as [number, number];
  const [ey, em] = end.split("-").map(Number) as [number, number];
  const months = Math.max(0, (ey - sy) * 12 + (em - sm));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} M.`;
  return m === 0 ? `${y} J.` : `${y} J. ${m} M.`;
}
