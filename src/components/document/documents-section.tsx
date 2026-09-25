import { getDocumentsAction } from "@/server/actions/documents";
import { DocumentUploadForm } from "./document-upload-form";
import { DocumentsTable } from "./documents-table";
import type { EntityType } from "@/lib/validators/document";

type Props = {
  entityType: EntityType;
  entityId: string;
  revalidateUrl: string;
  title?: string;
  description?: string;
};

export async function DocumentsSection({ entityType, entityId, title = "Dokumente", description }: Props) {
  const docs = await getDocumentsAction(entityType, entityId);
  const isEmpty = docs.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {!isEmpty && <DocumentUploadForm entityType={entityType} entityId={entityId} />}
      </div>

      {isEmpty ? (
        <DocumentUploadForm entityType={entityType} entityId={entityId} defaultOpen />
      ) : (
        <DocumentsTable docs={docs} entityType={entityType} entityId={entityId} />
      )}
    </div>
  );
}
