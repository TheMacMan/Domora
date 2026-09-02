"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fetchVpiFromDestatisAction,
  upsertVpiEntryAction,
  deleteVpiEntryAction,
} from "@/server/actions/cpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import type { VpiEntry } from "@/db/schema";

// ── Fetch button ────────────────────────────────────────────────────────────

export function VpiFetchButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleFetch() {
    setStatus(null);
    startTransition(async () => {
      const result = await fetchVpiFromDestatisAction();
      if (result.ok) {
        const latest = result.latestYearMonth ? ` · aktuellster Wert: ${fmtMonth(result.latestYearMonth)}` : "";
        setStatus({ ok: true, msg: `${result.added} neu, ${result.updated} aktualisiert${latest}` });
        router.refresh();
      } else {
        setStatus({ ok: false, msg: result.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button onClick={handleFetch} disabled={isPending} size="sm" variant="outline">
        <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Wird abgerufen…" : "Von Destatis abrufen"}
      </Button>
      {status && (
        <span className={`flex items-center gap-1.5 text-xs ${status.ok ? "text-green-600" : "text-destructive"}`}>
          {status.ok ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
          {status.msg}
        </span>
      )}
    </div>
  );
}

// ── Manual add form ─────────────────────────────────────────────────────────

export function VpiAddForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState("");
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = parseFloat(value.replace(",", "."));
    if (!month || isNaN(v)) { setError("Bitte Monat und Wert angeben."); return; }
    setError(null);
    startTransition(async () => {
      const result = await upsertVpiEntryAction(month, v);
      if (!result.ok) { setError(result.error); return; }
      setMonth("");
      setValue("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm font-medium mb-3">Wert manuell hinzufügen / überschreiben</p>
      {error && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-3 py-2 text-xs text-destructive mb-3">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vpi-month">Monat</Label>
          <Input id="vpi-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={isPending} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vpi-value">Indexwert (2020 = 100)</Label>
          <Input
            id="vpi-value" type="text" inputMode="decimal"
            value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="z. B. 120,3" disabled={isPending} className="w-36"
          />
        </div>
        <Button type="submit" size="sm" disabled={isPending || !month || !value}>
          <Plus className="size-4" />Speichern
        </Button>
      </form>
    </div>
  );
}

// ── Table with delete ───────────────────────────────────────────────────────

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y ?? "2020"), parseInt(m ?? "1") - 1, 1)
    .toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export function VpiTable({ entries }: { entries: VpiEntry[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteVpiEntryAction(id);
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        Noch keine VPI-Werte vorhanden. Jetzt von Destatis abrufen oder manuell hinzufügen.
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  return (
    <div className="rounded-xl border overflow-x-auto bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b">
            <th className="text-left px-4 py-3 font-medium">Monat</th>
            <th className="text-right px-4 py-3 font-medium">Indexwert</th>
            <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Δ Vormonat</th>
            <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Δ ggü. Vorjahr</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, i) => {
            const prev = sorted[i + 1];
            const delta1 = prev ? entry.value - prev.value : null;

            const [y, m] = entry.yearMonth.split("-");
            const lyYM = `${parseInt(y ?? "2020") - 1}-${m}`;
            const prevYear = sorted.find((e) => e.yearMonth === lyYM);
            const deltaY = prevYear ? entry.value - prevYear.value : null;
            const deltaPct = prevYear ? ((entry.value - prevYear.value) / prevYear.value) * 100 : null;

            return (
              <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
                <td className="px-4 py-3 font-medium">{fmtMonth(entry.yearMonth)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-mono font-medium">
                  {entry.value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-xs">
                  {delta1 != null ? (
                    <span className={delta1 >= 0 ? "text-green-600" : "text-destructive"}>
                      {delta1 >= 0 ? "+" : ""}{delta1.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                  ) : "–"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-xs">
                  {deltaY != null && deltaPct != null ? (
                    <span className={deltaY >= 0 ? "text-green-600" : "text-destructive"}>
                      {deltaY >= 0 ? "+" : ""}{deltaY.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{" "}
                      <span className="opacity-60">
                        ({deltaPct >= 0 ? "+" : ""}{deltaPct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %)
                      </span>
                    </span>
                  ) : "–"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost" size="icon" type="button"
                    className="size-7 text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    disabled={isPending}
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
