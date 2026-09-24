"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { currentYearMonth, formatMonthLong } from "@/lib/dates";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

type Props = {
  /** Aktuell angezeigter Monat, YYYY-MM */
  value: string;
  /** Zielseite, z. B. "/payments" — der Monat wird als ?month=YYYY-MM angehängt */
  basePath: string;
};

// Klick auf den Monatsnamen öffnet eine Jahres-/Monatsauswahl, damit man nicht
// monatsweise zurückblättern muss (z. B. von heute nach Januar 2025).
export function MonthPicker({ value, basePath }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7));
  const [year, setYear] = useState(selectedYear);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Beim Öffnen immer auf das Jahr des angezeigten Monats springen
  useEffect(() => {
    if (open) setYear(selectedYear);
  }, [open, selectedYear]);

  // Klick außerhalb + ESC schließen
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(ym: string) {
    setOpen(false);
    if (ym === value) return;
    startTransition(() => router.push(`${basePath}?month=${ym}`));
  }

  const today = currentYearMonth();

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center justify-center gap-1.5 w-48 rounded-md px-2 py-1 text-lg font-semibold hover:bg-muted/50 transition-colors ${isPending ? "opacity-60" : ""}`}
      >
        {formatMonthLong(value)}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Monat wählen"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover text-popover-foreground shadow-md p-3 space-y-3"
        >
          {/* Jahr */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="size-9 inline-flex items-center justify-center rounded-md hover:bg-muted/50"
              aria-label="Vorheriges Jahr"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="font-semibold tabular-nums">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="size-9 inline-flex items-center justify-center rounded-md hover:bg-muted/50"
              aria-label="Nächstes Jahr"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Monate */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((label, i) => {
              const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
              const isSelected = year === selectedYear && i + 1 === selectedMonth;
              const isToday = ym === today;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => go(ym)}
                  className={
                    "h-10 rounded-md text-sm font-medium transition-colors " +
                    (isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                        ? "border border-primary/50 text-primary hover:bg-primary/10"
                        : "hover:bg-muted/60")
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="border-t pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => go(today)}
              className="h-8 px-3 rounded-md text-xs font-medium text-primary hover:bg-primary/10"
            >
              Aktueller Monat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
