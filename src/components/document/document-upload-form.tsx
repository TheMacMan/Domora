"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDocumentAction } from "@/server/actions/documents";
import { DOCUMENT_TAGS, type EntityType } from "@/lib/validators/document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, CheckCircle2, AlertCircle } from "lucide-react";

const selectClass =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  entityType: EntityType;
  entityId: string;
  defaultOpen?: boolean;
};

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; done: number; total: number }
  | { kind: "done"; count: number }
  | { kind: "error"; messages: string[] };

export function DocumentUploadForm({ entityType, entityId, defaultOpen = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [isPending, startTransition] = useTransition();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFiles(Array.from(e.target.files ?? []));
    setUploadState({ kind: "idle" });
  }

  function handleClose() {
    setOpen(false);
    setSelectedFiles([]);
    setUploadState({ kind: "idle" });
    formRef.current?.reset();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    const form = e.currentTarget;
    const tag = (form.elements.namedItem("tag") as HTMLSelectElement).value;
    const notes = (form.elements.namedItem("notes") as HTMLInputElement).value;

    startTransition(async () => {
      const errors: string[] = [];
      setUploadState({ kind: "uploading", done: 0, total: selectedFiles.length });

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]!;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tag", tag);
        if (notes) fd.append("notes", notes);

        const result = await uploadDocumentAction(entityType, entityId, fd);
        if (!result.ok) {
          errors.push(`${file.name}: ${result.error}`);
        }
        setUploadState({ kind: "uploading", done: i + 1, total: selectedFiles.length });
      }

      if (errors.length > 0) {
        setUploadState({ kind: "error", messages: errors });
      } else {
        setUploadState({ kind: "done", count: selectedFiles.length });
        setSelectedFiles([]);
        formRef.current?.reset();
        router.refresh();
        // auto-close after short delay
        setTimeout(() => {
          setUploadState({ kind: "idle" });
          setOpen(false);
        }, 1200);
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" />
        Dokument hochladen
      </Button>
    );
  }

  const isUploading = isPending || uploadState.kind === "uploading";

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Dokumente hochladen</p>
        <button
          type="button"
          onClick={handleClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          disabled={isUploading}
        >
          <X className="size-4" />
        </button>
      </div>

      {uploadState.kind === "error" && (
        <div role="alert" className="rounded-md bg-destructive/15 border border-destructive/30 px-3 py-2 text-xs text-destructive space-y-1">
          {uploadState.messages.map((m, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              {m}
            </div>
          ))}
        </div>
      )}

      {uploadState.kind === "done" && (
        <div className="flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle2 className="size-3.5" />
          {uploadState.count === 1 ? "Dokument hochgeladen." : `${uploadState.count} Dokumente hochgeladen.`}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-file">
            Dateien{" "}
            <span className="text-muted-foreground font-normal">(PDF, JPG, PNG – max. 20 MB je Datei)</span>
          </Label>
          <Input
            ref={fileInputRef}
            id="doc-file"
            name="file"
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            disabled={isUploading}
            className="cursor-pointer"
          />
          {selectedFiles.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {selectedFiles.map((f, i) => (
                <li key={i}>{f.name} · {(f.size / 1024).toFixed(0)} KB</li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-tag">Kategorie</Label>
            <select id="doc-tag" name="tag" className={selectClass} disabled={isUploading} defaultValue="Sonstiges">
              {DOCUMENT_TAGS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-notes">Notiz <span className="text-muted-foreground font-normal">– optional</span></Label>
            <Input
              id="doc-notes"
              name="notes"
              type="text"
              placeholder="z. B. ausgestellt 2024"
              disabled={isUploading}
            />
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <Button type="submit" size="sm" disabled={isUploading || selectedFiles.length === 0}>
            {uploadState.kind === "uploading"
              ? `${uploadState.done} / ${uploadState.total} hochgeladen…`
              : selectedFiles.length > 1
                ? `${selectedFiles.length} Dateien hochladen`
                : "Hochladen"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={isUploading} onClick={handleClose}>
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
