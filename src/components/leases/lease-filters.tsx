"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type PropertyOption = { id: string; label: string };

type Props = {
  properties: PropertyOption[];
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "default",  label: "Aktiv + Zukünftig" },  // default, blendet beendete aus
  { value: "active",   label: "Nur aktiv" },
  { value: "future",   label: "Nur zukünftig" },
  { value: "ended",    label: "Nur beendet" },
  { value: "all",      label: "Alle (inkl. beendet)" },
];

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all",       label: "Alle Mietarten" },
  { value: "fixed",     label: "Nur Fest" },
  { value: "index",     label: "Nur Index" },
  { value: "graduated", label: "Nur Staffel" },
];

export function LeaseFilters({ properties }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const property = params.get("property") ?? "all";
  const status = params.get("status") ?? "default";
  const type = params.get("type") ?? "all";

  function update(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(params.toString());
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    // Beim Wechsel von Filtern Collapse-State verwerfen (sonst irritierend leere Sections)
    next.delete("collapsed");
    const qs = next.toString();
    router.push(qs ? `/leases?${qs}` : "/leases");
  }

  const hasActiveFilter = property !== "all" || status !== "default" || type !== "all";

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <Select value={property} onChange={(v) => update("property", v, "all")} ariaLabel="Objekt-Filter">
        <option value="all">Alle Objekte</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </Select>
      <Select value={status} onChange={(v) => update("status", v, "default")} ariaLabel="Status-Filter">
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
      <Select value={type} onChange={(v) => update("type", v, "all")} ariaLabel="Mietart-Filter">
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
      {hasActiveFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/leases")}
          className="text-muted-foreground"
        >
          <X className="size-3.5" />
          Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm hover:bg-muted/30 transition-colors"
    >
      {children}
    </select>
  );
}
