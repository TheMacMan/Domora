"use client";

import { useState } from "react";
import type { DocumentTarget } from "@/server/actions/documents";
import { DocumentPreview } from "./document-preview";
import { DocumentEditButton } from "./document-edit-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Eye } from "lucide-react";
import { formatDateObj as formatDate } from "@/lib/dates";

type Doc = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  tag: string;
  notes: string | null;
  title: string | null;
  year: number | null;
  createdAt: Date;
  entityType: string;
  entityId: string;
  linkCount?: number;
};

type Props = {
  docs: Doc[];
  targets: DocumentTarget[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PreviewState = { docId: string; filename: string; title?: string; mimeType: string } | null;

export function DocumentsTable({ docs, targets }: Props) {
  const [preview, setPreview] = useState<PreviewState>(null);

  return (
    <>
      {preview && (
        <DocumentPreview
          docId={preview.docId}
          filename={preview.filename}
          mimeType={preview.mimeType}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}

      <div className="rounded-xl border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <tbody>
            {docs.map((doc) => {
              const isImage = doc.mimeType.startsWith("image/");
              return (
                <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
                  {/* Thumbnail / icon */}
                  <td className="px-3 py-2 w-14">
                    <button
                      type="button"
                      onClick={() => setPreview({ docId: doc.id, filename: doc.filename, title: doc.title ?? undefined, mimeType: doc.mimeType })}
                      className="block rounded overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Vorschau"
                    >
                      {isImage ? (
                        <img
                          src={`/api/documents/${doc.id}`}
                          alt={doc.filename}
                          className="size-10 object-cover rounded border bg-muted"
                        />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded border bg-muted text-muted-foreground">
                          <FileText className="size-4" />
                        </span>
                      )}
                    </button>
                  </td>

                  {/* Name + notes */}
                  <td className="px-2 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => setPreview({ docId: doc.id, filename: doc.filename, title: doc.title ?? undefined, mimeType: doc.mimeType })}
                      className="text-left hover:underline focus-visible:outline-none focus-visible:underline"
                    >
                      {doc.title ?? doc.filename}
                    </button>
                    {doc.title && <p className="text-xs text-muted-foreground truncate">{doc.filename}</p>}
                    {doc.notes && <p className="text-xs text-muted-foreground mt-0.5">{doc.notes}</p>}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge variant="secondary">{doc.tag}</Badge>
                    {doc.year != null && <span className="ml-2 text-xs text-muted-foreground tabular-nums">{doc.year}</span>}
                  </td>

                  {/* Size */}
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell tabular-nums">
                    {formatBytes(doc.sizeBytes)}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell tabular-nums">
                    {formatDate(doc.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="size-7 text-muted-foreground hover:text-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        onClick={() => setPreview({ docId: doc.id, filename: doc.filename, title: doc.title ?? undefined, mimeType: doc.mimeType })}
                        title="Vorschau"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <DocumentEditButton
                        doc={{ id: doc.id, filename: doc.filename, title: doc.title, tag: doc.tag, year: doc.year, notes: doc.notes, entityType: doc.entityType, entityId: doc.entityId, linkCount: doc.linkCount }}
                        targets={targets}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
