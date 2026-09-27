"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

type Option = { value: string; label: string };

// Filterleiste der Dokumentenseite: Suche, Zuordnung, Jahr, Kategorie (Zustand in der URL)
export function DocumentFilters({ whereOptions, years, tags }: { whereOptions: Option[]; years: string[]; tags: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  // Suche mit kurzer Verzögerung übernehmen
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update("q", q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const active = ["q", "where", "year", "tag"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (Name, Notiz)…" className="pl-8" aria-label="Dokumente durchsuchen" />
      </div>
      <select className={selectClass} value={params.get("where") ?? ""} onChange={(e) => update("where", e.target.value)} aria-label="Zuordnung">
        <option value="">Alle Zuordnungen</option>
        {whereOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className={selectClass} value={params.get("year") ?? ""} onChange={(e) => update("year", e.target.value)} aria-label="Jahr">
        <option value="">Alle Jahre</option>
        {years.map((y) => <option key={y} value={y}>{y === "none" ? "Ohne Jahr" : y}</option>)}
      </select>
      <select className={selectClass} value={params.get("tag") ?? ""} onChange={(e) => update("tag", e.target.value)} aria-label="Kategorie">
        <option value="">Alle Kategorien</option>
        {tags.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {active && (
        <button
          type="button"
          onClick={() => { setQ(""); startTransition(() => router.replace(pathname, { scroll: false })); }}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <X className="size-4" />
          Zurücksetzen
        </button>
      )}
    </div>
  );
}
