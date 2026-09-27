"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOCUMENT_TAG_GROUPS, DOCUMENT_TAGS, type EntityType, type DocumentTag } from "@/lib/validators/document";
import { updateDocumentAction, deleteDocumentAction, type DocumentTarget } from "@/server/actions/documents";

const selectClass =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50";

export type EditableDoc = {
  id: string;
  filename: string;
  title: string | null;
  tag: string;
  year: number | null;
  notes: string | null;
  entityType: string;
  entityId: string;
};

// Bearbeiten-Knopf mit ausklappbarem Formular (Anzeigename, Kategorie, Jahr, Zuordnung, Notiz, Entfernen)
export function DocumentEditButton({ doc, targets }: { doc: EditableDoc; targets: DocumentTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(doc.title ?? "");
  const [tag, setTag] = useState(doc.tag);
  const [year, setYear] = useState(doc.year != null ? String(doc.year) : "");
  const [target, setTarget] = useState(`${doc.entityType}:${doc.entityId}`);
  const [notes, setNotes] = useState(doc.notes ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const y = year.trim() ? Number(year) : undefined;
    if (y != null && (!Number.isInteger(y) || y < 1990 || y > 2100)) {
      toast.error("Jahr bitte vierstellig eingeben, z. B. 2025.");
      return;
    }
    const [entityType, entityId] = target.split(":") as [EntityType, string];
    startTransition(async () => {
      const res = await updateDocumentAction(doc.id, {
        tag: tag as DocumentTag,
        year: y,
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        entityType,
        entityId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dokument gespeichert");
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`„${doc.title ?? doc.filename}" entfernen?\n\nDas Dokument wird ausgeblendet, die Datei bleibt für die Aufbewahrungsfrist archiviert.`)) return;
    startTransition(async () => {
      const res = await deleteDocumentAction(doc.id, doc.entityType as EntityType, doc.entityId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dokument entfernt");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        aria-label={`${doc.title ?? doc.filename} bearbeiten`}
        title="Bearbeiten"
      >
        <Pencil className="size-4" />
      </button>
    );
  }

  // Ältere Kategorien (z. B. „Beleg") bleiben auswählbar, solange sie gesetzt sind
  const knownTag = (DOCUMENT_TAGS as readonly string[]).includes(doc.tag);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !isPending && setOpen(false)}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-3 rounded-t-xl border bg-card p-4 shadow-xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Dokument bearbeiten</p>
            <p className="truncate text-xs text-muted-foreground">{doc.filename}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="text-muted-foreground hover:text-foreground" aria-label="Schließen">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`t-${doc.id}`}>Anzeigename <span className="font-normal text-muted-foreground">– optional</span></Label>
          <Input id={`t-${doc.id}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={doc.filename} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`c-${doc.id}`}>Kategorie</Label>
            <select id={`c-${doc.id}`} className={selectClass} value={tag} onChange={(e) => setTag(e.target.value)}>
              {!knownTag && <option value={doc.tag}>{doc.tag}</option>}
              {DOCUMENT_TAG_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.tags.map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`y-${doc.id}`}>Jahr</Label>
            <Input id={`y-${doc.id}`} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="z. B. 2025" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`z-${doc.id}`}>Zuordnung</Label>
          <select id={`z-${doc.id}`} className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)}>
            {(["Allgemein", "Objekte", "Mieter", "Verträge"] as const).map((g) => {
              const opts = targets.filter((t) => t.group === g);
              if (opts.length === 0) return null;
              return (
                <optgroup key={g} label={g}>
                  {opts.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`n-${doc.id}`}>Notiz <span className="font-normal text-muted-foreground">– optional</span></Label>
          <Input id={`n-${doc.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={isPending} className="text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
            Entfernen
          </Button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Abbrechen</Button>
            <Button type="submit" size="sm" loading={isPending}>Speichern</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
