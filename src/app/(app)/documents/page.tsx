import Link from "next/link";
import { Suspense } from "react";
import { FileText, FileSpreadsheet, Image as ImageIcon, ShieldAlert } from "lucide-react";
import { getAllDocumentsAction } from "@/server/actions/documents";
import { Badge } from "@/components/ui/badge";
import { Private } from "@/components/private";
import { formatDateObj } from "@/lib/dates";
import { GENERAL_ENTITY_ID, SENSITIVE_TENANT_TAGS } from "@/lib/validators/document";
import { DocumentUploadForm } from "@/components/document/document-upload-form";
import { DocumentFilters } from "@/components/document/document-filters";
import { DocumentEditButton } from "@/components/document/document-edit-button";
import { DocumentOpenButton } from "@/components/document/document-open-button";

export const metadata = { title: "Dokumente – Domora" };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className="size-5 text-muted-foreground shrink-0 mt-0.5" />;
  if (/sheet|excel|csv/.test(mime)) return <FileSpreadsheet className="size-5 text-muted-foreground shrink-0 mt-0.5" />;
  return <FileText className="size-5 text-muted-foreground shrink-0 mt-0.5" />;
}

type SearchParams = { q?: string; where?: string; year?: string; tag?: string };

// Alle Dokumente an einer Stelle: suchen, filtern, nach Jahr gruppiert. Hochladen mit wählbarer Zuordnung.
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { docs: all, targets } = await getAllDocumentsAction();

  const q = sp.q?.trim().toLowerCase() ?? "";
  const docs = all.filter((d) => {
    if (sp.where) {
      if (sp.where === "tenants" ? !(d.entityType === "tenant" || d.entityType === "lease") : `${d.entityType}:${d.entityId}` !== sp.where) return false;
    }
    if (sp.year) {
      if (sp.year === "none" ? d.year != null : String(d.year) !== sp.year) return false;
    }
    if (sp.tag && d.tag !== sp.tag) return false;
    if (q && ![d.title, d.filename, d.notes, d.entityLabel].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });

  // Nach Jahr gruppieren, neuestes zuerst, „ohne Jahr" am Ende
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const key = d.year != null ? String(d.year) : "none";
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => (a === "none" ? 1 : b === "none" ? -1 : Number(b) - Number(a)));
  const newestYear = groupKeys.find((k) => k !== "none");
  const filtered = Boolean(sp.q || sp.where || sp.year || sp.tag);

  // Filteroptionen aus dem Bestand
  const whereOptions = [
    { value: `general:${GENERAL_ENTITY_ID}`, label: "Allgemein" },
    ...targets
      .filter((t) => t.group === "Objekte" && all.some((d) => `${d.entityType}:${d.entityId}` === t.value))
      .map((t) => ({ value: t.value, label: t.label })),
    ...(all.some((d) => d.entityType === "tenant" || d.entityType === "lease") ? [{ value: "tenants", label: "Mieter & Verträge" }] : []),
  ];
  const years = [...new Set(all.map((d) => (d.year != null ? String(d.year) : "none")))].sort((a, b) =>
    a === "none" ? 1 : b === "none" ? -1 : Number(b) - Number(a),
  );
  const tags = [...new Set(all.map((d) => d.tag))].sort((a, b) => a.localeCompare(b, "de"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dokumente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length} Dokumente{filtered && ` · ${docs.length} gefiltert`} · Belege 10 Jahre aufbewahren
          </p>
        </div>
        <DocumentUploadForm entityType="general" entityId={GENERAL_ENTITY_ID} targets={targets} />
      </div>

      <Suspense>
        <DocumentFilters whereOptions={whereOptions} years={years} tags={tags} />
      </Suspense>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {all.length === 0 ? "Noch keine Dokumente hochgeladen." : "Keine Dokumente für diese Filter."}
        </div>
      ) : (
        groupKeys.map((key) => {
          const list = groups.get(key)!;
          // Ungefiltert: die zwei neuesten Jahre offen, ältere eingeklappt
          const open = filtered || key === newestYear || (newestYear != null && key !== "none" && Number(key) >= Number(newestYear) - 1);
          return (
            <details key={key} open={open} className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold">{key === "none" ? "Ohne Jahr" : key}</span>
                <span className="text-xs text-muted-foreground">
                  {list.length} {list.length === 1 ? "Dokument" : "Dokumente"}
                  <span className="ml-2 inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </summary>
              <ul className="divide-y border-t">
                {list.map((d) => (
                  <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                    <DocIcon mime={d.mimeType} />
                    <div className="min-w-0 flex-1">
                      <DocumentOpenButton doc={{ id: d.id, filename: d.filename, title: d.title, mimeType: d.mimeType }} variant="title">
                        {d.entityType === "tenant" ? <Private>{d.title ?? d.filename}</Private> : d.title ?? d.filename}
                      </DocumentOpenButton>
                      {d.title && <p className="truncate text-xs text-muted-foreground">{d.filename}</p>}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">{d.tag}</Badge>
                        <Link href={d.entityHref} className="underline hover:text-foreground">
                          {d.entityType === "tenant" ? <Private>{d.entityLabel}</Private> : d.entityLabel}
                        </Link>
                        <span>· {formatDateObj(d.createdAt)} · {formatBytes(d.sizeBytes)}</span>
                      </div>
                      {d.notes && <p className="mt-1 break-words text-xs text-muted-foreground">{d.notes}</p>}
                      {SENSITIVE_TENANT_TAGS.includes(d.tag) && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600">
                          <ShieldAlert className="size-3.5" />
                          Personenbezogen — nur so lange aufbewahren, wie für den Vertrag nötig
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <DocumentOpenButton doc={{ id: d.id, filename: d.filename, title: d.title, mimeType: d.mimeType }} variant="icon" />
                      <DocumentEditButton
                        doc={{ id: d.id, filename: d.filename, title: d.title, tag: d.tag, year: d.year, notes: d.notes, entityType: d.entityType, entityId: d.entityId }}
                        targets={targets}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          );
        })
      )}
    </div>
  );
}
