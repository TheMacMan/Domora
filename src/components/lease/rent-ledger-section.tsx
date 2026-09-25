import { getRentLedgerAction } from "@/server/actions/payments";
import { formatMoney } from "@/lib/money";
import { formatDate, formatMonthLong } from "@/lib/dates";
import { NkSettlementReceipts } from "@/components/payment/nk-settlement-receipts";
import type { LedgerEntry } from "@/lib/receipts";

// Mietkonto eines Vertrags: Soll je fälligem Monat gegen alle Eingänge, chronologisch
// mit laufendem Saldo, gruppiert nach Jahren. Darunter NK-Nachzahlungen/-Erstattungen.
export async function RentLedgerSection({ leaseId }: { leaseId: string }) {
  const { ledger, nkReceipts } = await getRentLedgerAction(leaseId);
  const { entries, totalSollCents, totalReceivedCents, balanceCents, currentMonthlySollCents } = ledger;

  const months = currentMonthlySollCents && balanceCents < 0 ? Math.abs(balanceCents) / currentMonthlySollCents : null;
  const balanceLabel = balanceCents < 0 ? "Rückstand" : balanceCents > 0 ? "Guthaben des Mieters" : "Ausgeglichen";
  const balanceColor = balanceCents < 0 ? "text-destructive" : balanceCents > 0 ? "text-green-600" : "";

  // Nach Jahren gruppieren (neuestes zuerst)
  const byYear = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const y = e.date.slice(0, 4);
    const list = byYear.get(y) ?? [];
    list.push(e);
    byYear.set(y, list);
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Mietkonto</h2>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed py-8 text-center">
          Noch keine fälligen Monate oder Eingänge.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className={`col-span-2 sm:col-span-1 rounded-xl border px-4 py-3 ${balanceCents < 0 ? "border-destructive/30 bg-destructive/5" : "bg-card"}`}>
              <p className="text-xs text-muted-foreground mb-1">{balanceLabel}</p>
              <p className={`text-lg font-bold tabular-nums ${balanceColor}`}>{formatMoney(Math.abs(balanceCents))}</p>
              {months != null && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  ≈ {months.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Monatsmieten
                </p>
              )}
            </div>
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Soll bis heute</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totalSollCents)}</p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Eingänge</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totalReceivedCents)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {years.map((y, idx) => {
              const list = byYear.get(y)!;
              const soll = -list.filter((e) => e.type === "soll").reduce((s, e) => s + e.amountCents, 0);
              const received = list.filter((e) => e.type === "receipt").reduce((s, e) => s + e.amountCents, 0);
              const endBalance = list[list.length - 1]!.balanceCents;
              return (
                <details key={y} open={idx === 0} className="rounded-xl border bg-card group">
                  <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="font-semibold">
                      {y} <span className="inline-block text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Soll {formatMoney(soll)} · Eingänge {formatMoney(received)} ·{" "}
                      <span className={endBalance < 0 ? "text-destructive" : endBalance > 0 ? "text-green-600" : ""}>
                        Saldo {formatMoney(endBalance)}
                      </span>
                    </span>
                  </summary>
                  {/* Liste statt 4-spaltiger Tabelle: links Datum + Buchung, rechts Betrag + Saldo —
                      bleibt auf dem iPhone lesbar, ohne horizontales Scrollen */}
                  <ul className="border-t divide-y text-sm">
                    {list.map((e, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-4 py-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground tabular-nums">{formatDate(e.date)}</p>
                          {e.type === "soll" ? (
                            <p className="text-muted-foreground">Miete {formatMonthLong(e.dueDate.slice(0, 7))}</p>
                          ) : (
                            <>
                              <p>
                                {e.amountCents < 0 ? "Rückzahlung" : "Eingang"}
                                {e.dueDate && <span className="text-muted-foreground"> · {formatMonthLong(e.dueDate.slice(0, 7))}</span>}
                              </p>
                              {e.note && <p className="text-xs text-muted-foreground break-words">{e.note}</p>}
                            </>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`tabular-nums font-medium ${e.type === "soll" ? "text-muted-foreground" : e.amountCents < 0 ? "text-destructive" : "text-green-600"}`}>
                            {formatMoney(e.amountCents)}
                          </p>
                          <p className={`text-xs tabular-nums ${e.balanceCents < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            Saldo {formatMoney(e.balanceCents)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </>
      )}

      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-semibold">NK-Nachzahlungen / -Erstattungen</h3>
        <p className="text-xs text-muted-foreground">
          Zahlungen aus Nebenkostenabrechnungen. Sie zählen in der Anlage V im Jahr der Zahlung, nicht im Mietkonto oben.
        </p>
        <NkSettlementReceipts
          leaseId={leaseId}
          receipts={nkReceipts.map((r) => ({ id: r.id, settlementYear: r.settlementYear, receivedAt: r.receivedAt, amountCents: r.amountCents, note: r.note }))}
        />
      </div>
    </section>
  );
}
