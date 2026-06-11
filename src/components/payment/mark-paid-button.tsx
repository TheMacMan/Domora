"use client";

import { useState, useTransition, useEffect, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { todayLocal, formatDate } from "@/lib/dates";
import { markAsPaidAction } from "@/server/actions/payments";

// Dritter Werktag (Mo–Fr) eines Periodenmonats (YYYY-MM-DD → period.slice(0,7)).
// Feiertage werden nicht berücksichtigt — bei Bedarf manuell korrigieren.
function thirdWorkingDay(periodStart: string): string {
  const [y, m] = periodStart.split("-").map(Number) as [number, number];
  let workdays = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(y, m - 1, day));
    if (d.getUTCMonth() !== m - 1) break;
    const dow = d.getUTCDay(); // 0=So, 6=Sa
    if (dow !== 0 && dow !== 6) {
      workdays++;
      if (workdays === 3) {
        return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  return periodStart; // Fallback
}

type Props = {
  paymentId: string;
  /** Periodenanfang (YYYY-MM-DD) — i.d.R. `payment.dueDate`. Vorbelegung des Datums. */
  defaultPaidAt: string;
  /** Anzeigetext des Trigger-Buttons. Default: "Bezahlt". */
  label?: string;
  /** zusätzliche Klassen für den Trigger-Button (für Layout-Kontext-Anpassung). */
  triggerClassName?: string;
};

export function MarkPaidButton({ paymentId, defaultPaidAt, label = "Bezahlt", triggerClassName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultPaidAt);
  const [isPending, startTransition] = useTransition();
  const dateId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb schließt das Popover
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // ESC schließt
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  function submit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Bitte Datum eingeben.");
      return;
    }
    startTransition(async () => {
      const res = await markAsPaidAction(paymentId, date);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Als bezahlt markiert");
      setOpen(false);
      router.refresh();
    });
  }

  const today = todayLocal();
  const thirdWd = thirdWorkingDay(defaultPaidAt);
  const isDefaultDate = date === defaultPaidAt;
  const isThirdWd = date === thirdWd;
  const isToday = date === today;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={`h-7 text-xs gap-1 text-green-600 border-green-500/30 hover:bg-green-500/10 hover:text-green-600 ${triggerClassName ?? ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Check className="size-3" />
        {label}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Als bezahlt markieren"
          className="absolute right-0 top-full mt-1 z-30 w-72 rounded-lg border bg-popover text-popover-foreground shadow-md p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Bezahlt am</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Schließen"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor={dateId} className="sr-only">Datum</Label>
            <Input
              id={dateId}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isPending}
              className="h-8 text-xs"
              autoFocus
            />
            <div className="flex gap-1 flex-wrap">
              <PresetChip
                active={isDefaultDate}
                onClick={() => setDate(defaultPaidAt)}
                disabled={isPending}
                title={`Periodenanfang (${formatDate(defaultPaidAt)})`}
              >
                1.
              </PresetChip>
              <PresetChip
                active={isThirdWd}
                onClick={() => setDate(thirdWd)}
                disabled={isPending}
                title={`3. Werktag (${formatDate(thirdWd)}) — vertragliche Frist`}
              >
                3. Werktag
              </PresetChip>
              <PresetChip
                active={isToday}
                onClick={() => setDate(today)}
                disabled={isPending}
                title={`Heute (${formatDate(today)})`}
              >
                Heute
              </PresetChip>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              loading={isPending}
              className="h-7 text-xs"
            >
              Bezahlt erfassen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetChip({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "h-7 rounded-md border text-[11px] font-medium transition-colors px-3 disabled:opacity-50 whitespace-nowrap " +
        (active
          ? "bg-primary/10 border-primary/40 text-primary"
          : "border-input hover:bg-muted/40 text-muted-foreground")
      }
    >
      {children}
    </button>
  );
}
