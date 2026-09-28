"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Link2, Paperclip, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { DocumentOpenButton } from "@/components/document/document-open-button";
import { DocumentUploadForm } from "@/components/document/document-upload-form";
import { linkDocumentAction, unlinkDocumentAction, type ReceiptPanelData, type ReceiptPanelDoc } from "@/server/actions/document-links";
import type { DocumentTarget } from "@/server/actions/documents";

type TargetType = "expense" | "expense_schedule" | "weg_abrechnung";

const selectClass =
  "border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

const SOURCE_LABEL = { schedule: "vom Abo", weg: "aus der WEG-Abrechnung" } as const;

// Belege einer Ausgabe, eines Abos oder einer WEG-Abrechnung: ansehen, lösen, vorhandene
// Dokumente verknüpfen, neue hochladen (Ablageort wählbar, Vorgabe = Objekt der Buchung).
export function ReceiptsSection({
  targetType,
  targetId,
  data,
  targets,
  hint,
}: {
  targetType: TargetType;
  targetId: string;
  data: ReceiptPanelData;
  targets: DocumentTarget[];
  hint?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pick, setPick] = useState("");
  const total = data.own.length + data.inherited.length;

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

  const name = (d: ReceiptPanelDoc) => d.title ?? d.filename;

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="size-4" />
          Belege
        </h2>
        {total > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            {total === 1 ? "1 Beleg" : `${total} Belege`}
          </span>
        ) : data.needed ? (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="size-3.5" />
            Beleg fehlt
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">kein Beleg nötig</span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {total > 0 && (
        <ul className="divide-y rounded-lg border">
          {data.own.map(({ linkId, doc }) => (
            <li key={linkId} className="flex items-center gap-2 py-1 pl-3 pr-1">
              <div className="min-w-0 flex-1">
                <DocumentOpenButton doc={doc} variant="title">{name(doc)}</DocumentOpenButton>
                {doc.title && <p className="truncate text-xs text-muted-foreground">{doc.filename}</p>}
              </div>
              <DocumentOpenButton doc={doc} variant="icon" />
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => unlinkDocumentAction(linkId), "Verknüpfung gelöst")}
                className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`${name(doc)} lösen`}
                title="Verknüpfung lösen (Dokument bleibt erhalten)"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
          {data.inherited.map(({ source, href, doc }) => (
            <li key={`${source}-${doc.id}`} className="flex items-center gap-2 py-1 pl-3 pr-1">
              <div className="min-w-0 flex-1">
                <DocumentOpenButton doc={doc} variant="title">{name(doc)}</DocumentOpenButton>
                <p className="text-xs text-muted-foreground">
                  gilt mit —{" "}
                  <Link href={href} className="underline hover:text-foreground">{SOURCE_LABEL[source]}</Link>
                </p>
              </div>
              <DocumentOpenButton doc={doc} variant="icon" />
            </li>
          ))}
        </ul>
      )}

      {data.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Passende Dokumente (nach Datum, Name und Kategorie):</p>
          <ul className="space-y-1">
            {data.suggestions.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-dashed py-1 pl-3 pr-1">
                <div className="min-w-0 flex-1">
                  <DocumentOpenButton doc={d} variant="title">{name(d)}</DocumentOpenButton>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => run(() => linkDocumentAction(d.id, targetType, targetId), "Beleg verknüpft")}
                >
                  <Link2 className="size-4" />
                  Verknüpfen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.others.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select className={selectClass} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Weiteres Dokument wählen">
            <option value="">Anderes Dokument wählen…</option>
            {data.others.map((d) => (
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
            onClick={() => run(() => linkDocumentAction(pick, targetType, targetId), "Beleg verknüpft")}
            className="shrink-0"
          >
            <Link2 className="size-4" />
            Verknüpfen
          </Button>
        </div>
      )}

      <DocumentUploadForm
        entityType={data.defaults.entityType}
        entityId={data.defaults.entityId}
        targets={targets}
        linkTarget={{ type: targetType, id: targetId }}
        defaultYear={data.defaults.year}
        defaultTag={data.defaults.tag}
        label="Beleg hochladen"
      />
    </section>
  );
}
