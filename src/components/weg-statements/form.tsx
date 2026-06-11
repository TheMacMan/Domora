"use client";

import { todayLocal } from "@/lib/dates";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/money";
import { CATEGORY_GROUPS, CATEGORY_LABELS, type ExpenseCategory } from "@/lib/expense";
import {
  createWegAbrechnungAction,
  updateWegAbrechnungAction,
  getHausgeldSumAction,
  type WegPositionInput,
} from "@/server/actions/weg-statements";
import { Plus, Trash2 } from "lucide-react";

type Property = { id: string; street: string; city: string };

const SELECTABLE_GROUPS = CATEGORY_GROUPS.map((g) => ({
  label: g.label,
  categories: g.categories.filter((c) => c !== "weg_hausgeld" && c !== "weg_saldo"),
})).filter((g) => g.categories.length > 0);

type Position = { kind: ExpenseCategory; description: string; amount: string };

type EditDefaults = {
  abrechnungId: string;
  propertyId: string;
  propertyLabel: string;
  year: number;
  abrechnungsDatum: string;
  notes: string;
  positions: Position[];
};

type Props =
  | { mode: "create"; properties: Property[] }
  | { mode: "edit"; defaults: EditDefaults };

export function WegAbrechnungForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isEdit = props.mode === "edit";

  const [propertyId, setPropertyId] = useState(isEdit ? props.defaults.propertyId : "");
  const [year, setYear] = useState<number>(
    isEdit ? props.defaults.year : new Date().getFullYear() - 1,
  );
  const [abrechnungsDatum, setAbrechnungsDatum] = useState(
    isEdit ? props.defaults.abrechnungsDatum : todayLocal(),
  );
  const [notes, setNotes] = useState(isEdit ? props.defaults.notes : "");
  const [positions, setPositions] = useState<Position[]>(
    isEdit ? props.defaults.positions : [{ kind: "bk_wasser", description: "", amount: "" }],
  );
  const [hausgeldSum, setHausgeldSum] = useState<number | null>(null);

  useEffect(() => {
    if (!propertyId || !Number.isFinite(year)) {
      setHausgeldSum(null);
      return;
    }
    let cancelled = false;
    getHausgeldSumAction(propertyId, year).then((sum) => {
      if (!cancelled) setHausgeldSum(sum);
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId, year]);

  const positionsSum = positions.reduce((s, p) => {
    const v = parseFloat(p.amount.replace(",", "."));
    return s + (Number.isFinite(v) ? Math.round(v * 100) : 0);
  }, 0);
  const saldo = positionsSum - (hausgeldSum ?? 0);

  function updatePos(i: number, patch: Partial<Position>) {
    setPositions((arr) => arr.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removePos(i: number) {
    setPositions((arr) => arr.filter((_, idx) => idx !== i));
  }
  function addPos() {
    setPositions((arr) => [...arr, { kind: "bk_wasser", description: "", amount: "" }]);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!propertyId) {
      toast.error("Objekt wählen");
      return;
    }
    const validPositions: WegPositionInput[] = positions
      .map((p) => ({
        category: p.kind,
        description: p.description.trim() || null,
        amountEur: parseFloat(p.amount.replace(",", ".")),
      }))
      .filter((p) => Number.isFinite(p.amountEur) && p.amountEur > 0);
    if (validPositions.length === 0) {
      toast.error("Mindestens eine Position mit Betrag > 0");
      return;
    }

    startTransition(async () => {
      const res = isEdit
        ? await updateWegAbrechnungAction(props.defaults.abrechnungId, {
            abrechnungsDatum,
            positions: validPositions,
            notes: notes.trim() || null,
          })
        : await createWegAbrechnungAction({
            propertyId,
            year,
            abrechnungsDatum,
            positions: validPositions,
            notes: notes.trim() || null,
          });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "WEG-Abrechnung aktualisiert" : "WEG-Abrechnung gespeichert");
      if (isEdit) {
        router.push(`/weg-statements/${props.defaults.abrechnungId}`);
      } else {
        const data = (res as { data?: { id?: string } }).data;
        if (data?.id) router.push(`/weg-statements/${data.id}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Stammdaten */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="propertyId">Objekt</Label>
          {isEdit ? (
            <Input value={props.defaults.propertyLabel} disabled />
          ) : (
            <select
              id="propertyId"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              disabled={isPending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">– bitte wählen –</option>
              {props.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.street}, {p.city}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="year">Abrechnungsjahr</Label>
          <Input
            id="year"
            type="number"
            min="2000"
            max="2099"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            disabled={isPending || isEdit}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="abrechnungsDatum">Datum der WEG-Abrechnung</Label>
          <Input
            id="abrechnungsDatum"
            type="date"
            value={abrechnungsDatum}
            onChange={(e) => setAbrechnungsDatum(e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      {/* Hausgeld-Snapshot */}
      {hausgeldSum != null && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Σ deiner Hausgeld-Vorauszahlungen für {year}
          </p>
          <p className="text-lg font-bold tabular-nums mt-0.5">{formatMoney(hausgeldSum)}</p>
          {hausgeldSum === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Noch keine Hausgeld-Ausgaben für dieses Jahr erfasst — du kannst sie nachträglich
              anlegen, dann stimmt der Saldo automatisch.
            </p>
          )}
        </div>
      )}

      {/* Positionen */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label className="text-sm font-medium">Positionen der WEG-Abrechnung</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Trage alle Posten aus der Jahresabrechnung ein. Jede Position bekommt automatisch
              den Leistungszeitraum {year}-01-01 bis {year}-12-31.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addPos} disabled={isPending}>
            <Plus className="size-4" />
            Position
          </Button>
        </div>

        <div className="space-y-2">
          {positions.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 sm:col-span-4">
                <select
                  value={p.kind}
                  onChange={(e) => updatePos(i, { kind: e.target.value as ExpenseCategory })}
                  disabled={isPending}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  {SELECTABLE_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.categories.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="col-span-7 sm:col-span-5">
                <Input
                  placeholder="Bezeichnung (optional)"
                  value={p.description}
                  onChange={(e) => updatePos(i, { description: e.target.value })}
                  disabled={isPending}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={p.amount}
                    onChange={(e) => updatePos(i, { amount: e.target.value })}
                    disabled={isPending}
                    className="pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    €
                  </span>
                </div>
              </div>
              <div className="col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removePos(i)}
                  disabled={isPending || positions.length === 1}
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Saldo-Vorschau */}
      {hausgeldSum != null && positionsSum > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Vorschau Verrechnung</h3>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Σ Posten</p>
              <p className="font-medium tabular-nums">{formatMoney(positionsSum)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">./. Hausgeld-Vorausz.</p>
              <p className="font-medium tabular-nums">{formatMoney(hausgeldSum)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Saldo</p>
              <p
                className={`font-bold tabular-nums ${saldo > 0 ? "text-amber-600" : saldo < 0 ? "text-emerald-600" : ""}`}
              >
                {formatMoney(saldo)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {saldo > 0 ? "Nachzahlung" : saldo < 0 ? "Erstattung" : "ausgeglichen"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">
          Notizen <span className="text-muted-foreground font-normal">– optional</span>
        </Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={isPending}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isPending}>
          Speichern
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            router.push(
              isEdit ? `/weg-statements/${props.defaults.abrechnungId}` : "/weg-statements",
            )
          }
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
