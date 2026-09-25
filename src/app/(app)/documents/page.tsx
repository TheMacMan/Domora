import Link from "next/link";
import { FileText, ExternalLink } from "lucide-react";
import { getAllDocumentsAction } from "@/server/actions/documents";
import { Badge } from "@/components/ui/badge";
import { formatDateObj } from "@/lib/dates";
import { DOCUMENT_TAGS } from "@/lib/validators/document";

export const metadata = { title: "Dokumente – Domora" };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ENTITY_KIND: Record<string, string> = { tenant: "Mieter", property: "Objekt", lease: "Vertrag" };

// Übersicht aller Dokumente. Hochgeladen wird beim jeweiligen Mieter, Objekt oder Vertrag.
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const all = await getAllDocumentsAction();
  const activeTag = tag && (DOCUMENT_TAGS as readonly string[]).includes(tag) ? tag : null;
  const docs = activeTag ? all.filter((d) => d.tag === activeTag) : all;
  const usedTags = DOCUMENT_TAGS.filter((t) => all.some((d) => d.tag === t));

  const chip = (active: boolean) =>
    `inline-flex items-center h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
      active ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:bg-muted"
    }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dokumente</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alle Dokumente im Überblick. Hochladen geht beim jeweiligen{" "}
          <Link href="/properties" className="underline">Objekt</Link>,{" "}
          <Link href="/leases" className="underline">Vertrag</Link> oder{" "}
          <Link href="/tenants" className="underline">Mieter</Link> (unten auf der Seite).
        </p>
      </div>

      {usedTags.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link href="/documents" className={chip(!activeTag)}>Alle ({all.length})</Link>
          {usedTags.map((t) => (
            <Link key={t} href={`/documents?tag=${encodeURIComponent(t)}`} className={chip(activeTag === t)}>
              {t} ({all.filter((d) => d.tag === t).length})
            </Link>
          ))}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {all.length === 0 ? "Noch keine Dokumente hochgeladen." : "Keine Dokumente in dieser Kategorie."}
        </div>
      ) : (
        <ul className="rounded-xl border bg-card divide-y">
          {docs.map((d) => (
            <li key={d.id} className="flex items-start gap-3 px-4 py-3">
              <FileText className="size-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{d.filename}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">{d.tag}</Badge>
                  <span>
                    {ENTITY_KIND[d.entityType] ?? d.entityType}:{" "}
                    <Link href={d.entityHref} className="underline hover:text-foreground">{d.entityLabel}</Link>
                  </span>
                  <span>· {formatDateObj(d.createdAt)} · {formatBytes(d.sizeBytes)}</span>
                </div>
                {d.notes && <p className="text-xs text-muted-foreground mt-1 break-words">{d.notes}</p>}
              </div>
              <a
                href={`/api/documents/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="size-10 -my-1 -mr-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0"
                aria-label={`${d.filename} öffnen`}
              >
                <ExternalLink className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
