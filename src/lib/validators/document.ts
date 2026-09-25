import { z } from "zod";

export const DOCUMENT_TAGS = [
  "Personalausweis",
  "Verdienstnachweis",
  "SCHUFA",
  "Mietvertrag",
  "Übergabeprotokoll",
  "Beleg",
  "Korrespondenz",
  "Steuer",
  "Sonstiges",
] as const;

export type DocumentTag = (typeof DOCUMENT_TAGS)[number];

// "general" = objektübergreifend (z. B. Steuererklärung, Bescheide) — entityId ist dann "general"
export const ENTITY_TYPES = ["tenant", "property", "lease", "general"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const GENERAL_ENTITY_ID = "general";

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const documentMetaSchema = z.object({
  tag: z.enum(DOCUMENT_TAGS),
  notes: z.string().max(500).optional(),
});

export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;
