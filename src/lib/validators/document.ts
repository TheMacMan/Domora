import { z } from "zod";

// Kategorien — gruppiert nach Themen. Ältere Werte (z. B. „Beleg“) bleiben gültig.
export const DOCUMENT_TAG_GROUPS = [
  { label: "Steuer & Finanzen", tags: ["Steuer", "Darlehen & Zinsen", "Versicherung"] },
  { label: "Objekt & Nebenkosten", tags: ["Wasser & Abwasser", "Energie", "Grundsteuer & Gebühren", "Handwerker & Renovierung", "WEG"] },
  { label: "Mieter", tags: ["Mietvertrag", "Übergabeprotokoll", "Personalausweis", "Verdienstnachweis", "SCHUFA"] },
  { label: "Allgemein", tags: ["Korrespondenz", "Beleg", "Sonstiges"] },
] as const;

export const DOCUMENT_TAGS = [
  "Steuer",
  "Darlehen & Zinsen",
  "Versicherung",
  "Wasser & Abwasser",
  "Energie",
  "Grundsteuer & Gebühren",
  "Handwerker & Renovierung",
  "WEG",
  "Mietvertrag",
  "Übergabeprotokoll",
  "Personalausweis",
  "Verdienstnachweis",
  "SCHUFA",
  "Korrespondenz",
  "Beleg",
  "Sonstiges",
] as const;

export type DocumentTag = (typeof DOCUMENT_TAGS)[number];

// Personenbezogene Mieterunterlagen: nur so lange aufbewahren, wie nötig (DSGVO)
export const SENSITIVE_TENANT_TAGS: readonly string[] = ["Personalausweis", "Verdienstnachweis", "SCHUFA"];

// "general" = objektübergreifend (z. B. Steuererklärung, Bescheide) — entityId ist dann "general"
export const ENTITY_TYPES = ["tenant", "property", "lease", "general"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const GENERAL_ENTITY_ID = "general";

// Erlaubte Dateitypen je Endung → kanonischer MIME-Typ. Geprüft wird über die Endung,
// weil Browser z. B. für CSV je nach System "text/csv", "application/vnd.ms-excel" oder "" melden.
export const FILE_TYPES = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain",
} as const;

export type FileExtension = keyof typeof FILE_TYPES;
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(",");
export const FILE_TYPES_LABEL = "PDF, JPG, PNG, Excel, CSV, Word, Text";

export function resolveFileType(filename: string): { ext: FileExtension; mime: string } | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!(ext in FILE_TYPES)) return null;
  const e = ext as FileExtension;
  return { ext: e === "jpeg" ? "jpg" : e, mime: FILE_TYPES[e] };
}

// Im Browser direkt anzeigbar (Vorschau/inline) — alles andere nur als Download
export function isPreviewable(mime: string) {
  return mime === "application/pdf" || mime.startsWith("image/");
}

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const yearField = z.number().int().min(1990).max(2100).optional();

export const documentMetaSchema = z.object({
  tag: z.enum(DOCUMENT_TAGS),
  notes: z.string().max(500).optional(),
  year: yearField,
  title: z.string().max(200).optional(),
});

export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;

// Nachträgliches Bearbeiten inkl. Verschieben (Zuordnung ändern)
export const documentUpdateSchema = documentMetaSchema.extend({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(40),
});

export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;
