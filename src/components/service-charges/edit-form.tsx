"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { formatMoney } from "@/lib/money";
import { CATEGORY_LABELS, type ExpenseCategory } from "@/lib/expense";
import { DISTRIBUTION_LABELS, DEFAULT_MIX_CONSUMPTION_PERMILLE } from "@/lib/nk-abrechnung";
import { updateNkCategoryDistributionAction } from "@/server/actions/service-charges";
import type { NkDistributionKey } from "@/db/schema";
import { ArrowLeft, AlertTriangle } from "lucide-react";

type LeasePos = {
  leaseAbrechnungId: string;
  unitName: string;
  tenants: string;
  monthsActive: number;
  consumptionValue: number | null;
};

type CategoryGroup = {
  category: string;
  totalCostsCents: number;
  distributionKey: string;
  mixConsumptionPermille: number | null;
  leasePositions: LeasePos[];
};

type Props = {
  abrechnungId: string;
  categories: CategoryGroup[];
};

const KEYS: NkDistributionKey[] = ["area", "units", "consumption", "mix"];

export function NkAbrechnungEditForm({ abrechnungId, categories }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/service-charges/${abrechnungId}`)}>
        <ArrowLeft className="size-4" />
        Zurück
      </Button>

      {categories.map((cat) => (
        <CategoryEditor key={cat.category} abrechnungId={abrechnungId} category={cat} />
      ))}
    </div>
  );
}

function CategoryEditor({ abrechnungId, category }: { abrechnungId: string; category: CategoryGroup }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [key, setKey] = useState<NkDistributionKey>(category.distributionKey as NkDistributionKey);
  const [mixPermille, setMixPermille] = useState<number>(category.mixConsumptionPermille ?? DEFAULT_MIX_CONSUMPTION_PERMILLE);
  const [consumption, setConsumption] = useState<Record<string, string>>(
    Object.fromEntries(category.leasePositions.map((lp) => [lp.leaseAbrechnungId, lp.consumptionValue != null ? String(lp.consumptionValue) : ""])),
  );

  const needsConsumption = key === "consumption" || key === "mix";

  function handleSave() {
    const consumptionPerLease: Record<string, number> = {};
    for (const [leaseId, val] of Object.entries(consumption)) {
      const num = parseFloat(val.replace(",", "."));
      if (Number.isFinite(num) && num > 0) consumptionPerLease[leaseId] = num;
    }
    startTransition(async () => {
      const res = await updateNkCategoryDistributionAction(abrechnungId, category.category as ExpenseCategory, {
        distributionKey: key,
        mixConsumptionPermille: key === "mix" ? mixPermille : undefined,
        consumptionPerLease: needsConsumption ? consumptionPerLease : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Verteilerschlüssel aktualisiert");
      router.refresh();
    });
  }

  const isHeizungWithLowConsumption = (category.category === "bk_heizung" || category.category === "bk_warmwasser") && key === "mix" && mixPermille < 500;
  const isHeizungAreaOnly = (category.category === "bk_heizung" || category.category === "bk_warmwasser") && key === "area";

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">{CATEGORY_LABELS[category.category as keyof typeof CATEGORY_LABELS]}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gesamtkosten: <span className="tabular-nums font-medium text-foreground">{formatMoney(category.totalCostsCents)}</span>
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">{category.leasePositions.length} Position{category.leasePositions.length === 1 ? "" : "en"}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Verteilerschlüssel</Label>
          <select
            value={key}
            onChange={(e) => setKey(e.target.value as NkDistributionKey)}
            disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {KEYS.map((k) => (
              <option key={k} value={k}>{DISTRIBUTION_LABELS[k]}</option>
            ))}
          </select>
        </div>
        {key === "mix" && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Anteil Verbrauch (%)</Label>
            <div className="relative max-w-[120px]">
              <Input
                type="number"
                min="0"
                max="100"
                step="10"
                value={Math.round(mixPermille / 10)}
                onChange={(e) => setMixPermille(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) * 10)}
                disabled={isPending}
                className="pr-7"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
            </div>
            {isHeizungWithLowConsumption && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                HeizkostenV verlangt mindestens 50 % Verbrauchsanteil
              </p>
            )}
          </div>
        )}
      </div>

      {needsConsumption && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <Label className="text-xs font-medium">Verbrauchswerte pro Wohneinheit</Label>
          <p className="text-xs text-muted-foreground">Einheit beliebig (kWh, m³ etc.) — nur das Verhältnis zählt</p>
          <div className="space-y-2">
            {category.leasePositions.map((lp) => (
              <div key={lp.leaseAbrechnungId} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-7">
                  <p className="text-sm font-medium truncate">{lp.unitName}</p>
                  <p className="text-xs text-muted-foreground truncate">{lp.tenants} · {lp.monthsActive}/12 Mon.</p>
                </div>
                <div className="col-span-5">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={consumption[lp.leaseAbrechnungId] ?? ""}
                    onChange={(e) => setConsumption((c) => ({ ...c, [lp.leaseAbrechnungId]: e.target.value }))}
                    disabled={isPending}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isHeizungAreaOnly && (
        <p className="text-xs text-muted-foreground italic">
          Hinweis: 100 % nach Wohnfläche weicht von § 7 HeizkostenV (≥ 50 % Verbrauch) ab — wird hier zugelassen.
        </p>
      )}

      <Button onClick={handleSave} loading={isPending} size="sm">
        Speichern
      </Button>
    </section>
  );
}
