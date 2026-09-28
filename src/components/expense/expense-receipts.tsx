"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Link2, Paperclip, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { DocumentOpenButton } from "@/components/document/document-open-button";
import { DocumentUploadForm } from "@/components/document/document-upload-form";
import { GENERAL_ENTITY_ID } from "@/lib/validators/document";
import { linkReceiptAction, unlinkReceiptAction } from "@/server/actions/expense-receipts";

type Doc = { id: string; filename: string; title: string | null; mimeType: string; year: number | null };

const selectClass =
  "border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

// Belege einer Ausgabe: verknüpfte Dokumente ansehen/lösen, vorhandene verknüpfen, neue hochladen
export function ExpenseReceipts({
  expenseId,
  propertyId,
  year,
  needed,
  linked,
  suggestions,
  others,
}: {
  expenseId: string;
  propertyId: string | null;
  year: number;
  needed: boolean;
  linked: Doc[];
  suggestions: Doc[];
  others: Doc[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pick, setPick] = useState("");

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      setPick("");
      router.refresh();
    });
  }

  const name = (d: Doc) => d.title ?? d.filename;

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="size-4" />
          Belege
        </h2>
        {linked.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            {linked.length === 1 ? "1 Beleg verknüpft" : `${linked.length} Belege verknüpft`}
          </span>
        ) : needed ? (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="size-3.5" />
            Beleg fehlt
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">kein eigener Beleg nötig</span>
        )}
      </div>

      {linked.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {linked.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-1 pl-3 pr-1">
              <div className="min-w-0 flex-1">
                <DocumentOpenButton doc={d} variant="title">{name(d)}</DocumentOpenButton>
                {d.title && <p className="truncate text-xs text-muted-foreground">{d.filename}</p>}
              </div>
              <DocumentOpenButton doc={d} variant="icon" />
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => unlinkReceiptAction(expenseId, d.id), "Verknüpfung gelöst")}
                className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`${name(d)} lösen`}
                title="Verknüpfung lösen (Dokument bleibt erhalten)"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Passende Dokumente (nach Datum und Name):</p>
          <ul className="space-y-1">
            {suggestions.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-dashed py-1 pl-3 pr-1">
                <div className="min-w-0 flex-1">
                  <DocumentOpenButton doc={d} variant="title">{name(d)}</DocumentOpenButton>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => run(() => linkReceiptAction(expenseId, d.id), "Beleg verknüpft")}
                >
                  <Link2 className="size-4" />
                  Verknüpfen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select className={selectClass} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Weiteres Dokument wählen">
            <option value="">Anderes Dokument wählen…</option>
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {d.year ? `${d.year} · ` : ""}{name(d)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pick || isPending}
            onClick={() => run(() => linkReceiptAction(expenseId, pick), "Beleg verknüpft")}
            className="shrink-0"
          >
            <Link2 className="size-4" />
            Verknüpfen
          </Button>
        </div>
      )}

      <DocumentUploadForm
        entityType={propertyId ? "property" : "general"}
        entityId={propertyId ?? GENERAL_ENTITY_ID}
        linkExpenseId={expenseId}
        defaultYear={year}
        label="Beleg hochladen"
      />
    </section>
  );
}
