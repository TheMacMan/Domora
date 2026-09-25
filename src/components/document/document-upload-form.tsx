"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDocumentAction } from "@/server/actions/documents";
import { DOCUMENT_TAGS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, type EntityType } from "@/lib/validators/document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, CheckCircle2, AlertCircle, FileUp } from "lucide-react";

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

  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  // Neue Dateien prüfen (Typ, Größe) und an die Auswahl anhängen — Duplikate ignorieren
  function addFiles(list: FileList | File[]) {
    const ok: File[] = [];
    const bad: string[] = [];
    for (const f of Array.from(list)) {
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(f.type)) bad.push(`${f.name}: nur PDF, JPG oder PNG`);
      else if (f.size > MAX_FILE_SIZE_BYTES) bad.push(`${f.name}: größer als 20 MB`);
      else ok.push(f);
    }
    setSelectedFiles((prev) => [
      ...prev,
      ...ok.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size)),
    ]);
    setRejected(bad);
    setUploadState({ kind: "idle" });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files ?? []);
    e.target.value = ""; // gleiche Datei erneut wählbar
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setDragOver(false);
      setOpen(true);
      addFiles(e.dataTransfer.files);
    },
  };

  function handleClose() {
    setOpen(false);
    setSelectedFiles([]);
    setRejected([]);
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

        // Netzwerk-/Serverfehler (z. B. Größenlimit) abfangen statt die Seite abstürzen zu lassen
        try {
          const result = await uploadDocumentAction(entityType, entityId, fd);
          if (!result.ok) errors.push(`${file.name}: ${result.error}`);
        } catch {
          errors.push(`${file.name}: Hochladen fehlgeschlagen (Server-Fehler). Bitte erneut versuchen.`);
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        {...dropHandlers}
        className={dragOver ? "ring-2 ring-primary border-primary" : ""}
        title="Klicken oder Dateien hierher ziehen"
      >
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
          {/* Drop-Zone: Dateien hineinziehen oder antippen/klicken zum Auswählen */}
          <label
            htmlFor="doc-file"
            {...dropHandlers}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-input hover:bg-muted/30"
            } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
          >
            <FileUp className={`size-6 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">{dragOver ? "Loslassen zum Hinzufügen" : "Dateien hierher ziehen"}</span>
            <span className="text-xs text-muted-foreground">oder tippen bzw. klicken zum Auswählen</span>
          </label>
          <input
            ref={fileInputRef}
            id="doc-file"
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            disabled={isUploading}
            className="sr-only"
          />
          {rejected.length > 0 && (
            <ul className="text-xs text-destructive space-y-0.5">
              {rejected.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          {selectedFiles.length > 0 && (
            <ul className="rounded-md border divide-y text-sm">
              {selectedFiles.map((f, i) => (
                <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 pl-3 pr-1 py-1">
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={isUploading}
                    className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label={`${f.name} entfernen`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
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
