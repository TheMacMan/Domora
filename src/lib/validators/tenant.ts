import { z } from "zod";

export const tenantSchema = z.object({
  firstName: z.string().min(1, "Vorname erforderlich").max(100),
  lastName: z.string().min(1, "Nachname erforderlich").max(100),
  email: z.string().email("Ungültige E-Mail-Adresse").max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

export type TenantFormInput = z.infer<typeof tenantSchema>;
