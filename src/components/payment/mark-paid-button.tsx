"use client";

import { useState, useTransition, useEffect, useRef, useId, useCallback } from "react";
import { createPortal } from "react-dom";
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

// Breite des Popovers, am Handy auf die Viewport-Breite (minus Rand) begrenzt.
const POPOVER_WIDTH = 288; // entspricht w-72
const POPOVER_EST_HEIGHT = 180;
const VIEWPORT_MARGIN = 8;

export function MarkPaidButton({ paymentId, defaultPaidAt, label = "Bezahlt", triggerClassName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultPaidAt);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const dateId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Position aus dem Trigger-Rechteck berechnen und in den Viewport einpassen —
  // via Portal + position:fixed, damit kein overflow-Container das Popover clippt.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(POPOVER_WIDTH, vw - 2 * VIEWPORT_MARGIN);
    // Rechtsbündig zum Trigger, aber innerhalb des Viewports halten.
    let left = rect.right - width;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - width - VIEWPORT_MARGIN));
    // Unter dem Trigger, sonst darüber, wenn unten kein Platz ist.
    let top = rect.bottom + 4;
    if (top + POPOVER_EST_HEIGHT > vh && rect.top - POPOVER_EST_HEIGHT - 4 > 0) {
      top = rect.top - POPOVER_EST_HEIGHT - 4;
    }
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, reposition]);

  // Klick außerhalb (Trigger + Popover) schließt
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
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
    <>
      <Button
        ref={triggerRef}
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

      {open && mounted && pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Als bezahlt markieren"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-50 rounded-lg border bg-popover text-popover-foreground shadow-md p-3 space-y-3"
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
                className="h-9 text-base md:h-8 md:text-xs"
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
                className="h-8 text-xs"
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
                className="h-8 text-xs"
              >
                Bezahlt erfassen
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </>
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
        "h-8 rounded-md border text-xs font-medium transition-colors px-3 disabled:opacity-50 whitespace-nowrap " +
        (active
          ? "bg-primary/10 border-primary/40 text-primary"
          : "border-input hover:bg-muted/40 text-muted-foreground")
      }
    >
      {children}
    </button>
  );
}
