"use client";

import { useMemo, useState } from "react";
import { Search, X, UserPlus, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TenantOption = {
  id: string;
  firstName: string;
  lastName: string;
  hasActiveLease: boolean;
};

type Props = {
  tenants: TenantOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function TenantMultiSelect({ tenants, value, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [hideWithActive, setHideWithActive] = useState(false);

  const labelOf = (t: TenantOption) => `${t.lastName}, ${t.firstName}`;

  const selectedTenants = useMemo(
    () => value.map((id) => tenants.find((t) => t.id === id)).filter(Boolean) as TenantOption[],
    [tenants, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants
      .filter((t) => !value.includes(t.id))
      .filter((t) => (hideWithActive ? !t.hasActiveLease : true))
      .filter((t) => {
        if (!q) return true;
        return labelOf(t).toLowerCase().includes(q);
      });
  }, [tenants, value, query, hideWithActive]);

  function toggle(id: string, checked: boolean) {
    if (disabled) return;
    onChange(checked ? [...value, id] : value.filter((x) => x !== id));
  }

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      {/* Suche + Filter */}
      <div className="border-b bg-muted/30 px-3 py-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mieter suchen…"
            disabled={disabled}
            className="h-8 pl-7 pr-7 text-sm"
            aria-label="Mieter suchen"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche leeren"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded accent-primary"
            checked={hideWithActive}
            onChange={(e) => setHideWithActive(e.target.checked)}
            disabled={disabled}
          />
          Nur Mieter ohne aktiven Vertrag anzeigen
        </label>
      </div>

      {/* Ausgewählt — sticky oben, immer sichtbar */}
      {selectedTenants.length > 0 && (
        <div className="border-b bg-primary/5">
          <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ausgewählt ({selectedTenants.length})
          </p>
          <div className="divide-y">
            {selectedTenants.map((t) => (
              <Row
                key={t.id}
                tenant={t}
                checked
                onToggle={(c) => toggle(t.id, c)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )}

      {/* Verfügbare Liste */}
      <div className="max-h-[320px] overflow-y-auto divide-y">
        {tenants.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground italic">Noch keine Mieter angelegt.</p>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {query ? (
              <>
                Kein Mieter „<span className="font-medium text-foreground">{query}</span>" gefunden.
                <br />
                <a
                  href="/tenants/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline mt-1 inline-block text-primary"
                >
                  Neuen Mieter anlegen
                </a>
              </>
            ) : selectedTenants.length === tenants.length ? (
              "Alle Mieter ausgewählt."
            ) : (
              "Keine Mieter entsprechen dem Filter."
            )}
          </div>
        ) : (
          filtered.map((t) => (
            <Row
              key={t.id}
              tenant={t}
              checked={false}
              onToggle={(c) => toggle(t.id, c)}
              disabled={disabled}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/20 px-3 py-2">
        <a
          href="/tenants/new"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <UserPlus className="size-3.5" />
          Neuen Mieter anlegen
          <span className="text-muted-foreground ml-1">(öffnet neuen Tab)</span>
        </a>
      </div>
    </div>
  );
}

function Row({
  tenant,
  checked,
  onToggle,
  disabled,
}: {
  tenant: TenantOption;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 px-3 py-2 cursor-pointer select-none text-sm transition-colors",
        checked ? "" : "hover:bg-muted/40",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <input
        type="checkbox"
        className="rounded accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className={cn("flex-1 truncate", checked && "font-medium")}>
        {tenant.lastName}, {tenant.firstName}
      </span>
      {tenant.hasActiveLease && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 shrink-0"
          title="Dieser Mieter steht bereits in einem aktiven oder zukünftigen Mietvertrag"
        >
          <BadgeCheck className="size-3" />
          aktiver Vertrag
        </span>
      )}
    </label>
  );
}
