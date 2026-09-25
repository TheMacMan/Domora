import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

// Aufklappbare Liste der Zahlungseingänge eines Monats — nur sichtbar, wenn es
// mehr als einen Eingang gibt. Natives <details>, kein Client-JS nötig.
export function ReceiptsDetails({
  receipts,
  align = "right",
}: {
  receipts: Array<{ id: string; receivedAt: string; amountCents: number }>;
  align?: "left" | "right";
}) {
  if (receipts.length < 2) return null;
  return (
    <details className="mt-0.5 text-xs font-normal text-muted-foreground group">
      <summary className={`cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:text-foreground py-1.5 -my-1 text-primary ${align === "right" ? "text-right" : ""}`}>
        {receipts.length} Eingänge <span className="inline-block transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul className="mt-1 space-y-0.5">
        {receipts.map((r) => (
          <li key={r.id} className={`flex gap-3 tabular-nums ${align === "right" ? "justify-end" : ""}`}>
            <span>{formatDate(r.receivedAt)}</span>
            <span className={r.amountCents < 0 ? "text-destructive" : ""}>{formatMoney(r.amountCents)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
