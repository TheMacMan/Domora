"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { DocumentPreview } from "./document-preview";

// Öffnet ein Dokument in der Vorschau innerhalb der App (mit Schließen/Esc) statt in einem
// neuen Fenster — in der installierten App gäbe es dort kein Zurück.
export function DocumentOpenButton({
  doc,
  variant,
  children,
}: {
  doc: { id: string; filename: string; title?: string | null; mimeType: string };
  variant: "title" | "icon";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "title" ? (
        <button type="button" onClick={() => setOpen(true)} className="block max-w-full truncate text-left font-medium hover:underline">
          {children}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label={`${doc.title ?? doc.filename} ansehen`}
          title="Ansehen"
        >
          <Eye className="size-4" />
        </button>
      )}
      {open && <DocumentPreview docId={doc.id} filename={doc.filename} title={doc.title ?? undefined} mimeType={doc.mimeType} onClose={() => setOpen(false)} />}
    </>
  );
}
