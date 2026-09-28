"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip } from "lucide-react";
import { DocumentPreview } from "@/components/document/document-preview";

type Doc = { id: string; filename: string; title: string | null; mimeType: string };

// Büroklammer in der Ausgabenliste: öffnet den Beleg direkt in der Vorschau.
// Bei mehreren Belegen erst eine kleine Auswahl.
export function ReceiptPreviewButton({ docs }: { docs: Doc[] }) {
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState<Doc | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  if (docs.length === 0) return null;

  function onClick(e: React.MouseEvent) {
    // Liegt in der mobilen Ansicht innerhalb eines Links — nicht zur Bearbeiten-Seite springen
    e.preventDefault();
    e.stopPropagation();
    if (docs.length === 1) setPreview(docs[0]!);
    else setMenu((m) => !m);
  }

  const name = (d: Doc) => d.title ?? d.filename;

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        className="-my-1.5 inline-flex min-h-8 min-w-8 items-center justify-center gap-0.5 rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:my-0 sm:min-h-0 sm:min-w-0 sm:py-0.5"
        aria-label={docs.length === 1 ? `Beleg ansehen: ${name(docs[0]!)}` : `${docs.length} Belege ansehen`}
        title={docs.length === 1 ? `Beleg ansehen: ${name(docs[0]!)}` : `${docs.length} Belege ansehen`}
      >
        <Paperclip className="size-3.5" />
        {docs.length > 1 && docs.length}
      </button>
      {menu && (
        <span className="fixed inset-x-3 bottom-3 z-40 flex flex-col rounded-xl border bg-popover p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1 sm:w-72 sm:rounded-lg sm:pb-1">
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu(false);
                setPreview(d);
              }}
              className="truncate rounded px-3 py-3 text-left text-sm hover:bg-muted sm:px-2 sm:py-1.5 sm:text-xs"
            >
              {name(d)}
            </button>
          ))}
        </span>
      )}
      {preview &&
        createPortal(
          // Portal + stopPropagation: Klicks in der Vorschau erreichen den umgebenden Link nicht
          <div onClick={(e) => e.stopPropagation()}>
            <DocumentPreview
              docId={preview.id}
              filename={preview.filename}
              title={preview.title ?? undefined}
              mimeType={preview.mimeType}
              onClose={() => setPreview(null)}
            />
          </div>,
          document.body,
        )}
    </span>
  );
}
