"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CATEGORY_GROUPS, CATEGORY_LABELS, type ExpenseCategory } from "@/lib/expense";
import { Search, X } from "lucide-react";

type Property = { id: string; label: string };

export function ExpenseFilters({
  years,
  properties,
  currentYear,
  currentProperty,
  currentCategory,
  currentSearch,
  currentSort,
}: {
  years: number[];
  properties: Property[];
  currentYear: string;
  currentProperty: string;
  currentCategory: string;
  currentSearch: string;
  currentSort: "date" | "period";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(currentSearch);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  // Debounced Search
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== currentSearch) setParam("q", searchInput || null);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, currentSearch]);

  return (
    <div className="space-y-3">
      {/* Jahr-Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Jahr:</span>
        <button
          type="button"
          onClick={() => setParam("year", null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            !currentYear ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          Alle
        </button>
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setParam("year", String(y))}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors tabular-nums",
              currentYear === String(y) ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Property + Category + Search + Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        {properties.length > 1 && (
          <select
            value={currentProperty || "all"}
            onChange={(e) => setParam("property", e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="all">Alle Objekte</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        )}

        <select
          value={currentCategory || "all"}
          onChange={(e) => setParam("category", e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        >
          <option value="all">Alle Kategorien</option>
          {CATEGORY_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.categories.map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat as ExpenseCategory]}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="relative flex-1 min-w-[150px] max-w-[280px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Suche…"
            className="h-8 pl-7 pr-7 text-xs"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sortierung:</span>
          <select
            value={currentSort}
            onChange={(e) => setParam("sort", e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="date">Buchungsdatum</option>
            <option value="period">Leistungszeitraum</option>
          </select>
        </div>
      </div>
    </div>
  );
}
