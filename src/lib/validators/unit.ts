import { z } from "zod";

export const unitSchema = z.object({
  name: z.string().min(1, "Bezeichnung erforderlich").max(100),
  floor: z.number().int().min(-5).max(50).optional(),
  livingArea: z.number({ required_error: "Wohnfläche erforderlich" }).positive("Wohnfläche muss positiv sein"),
  notes: z.string().max(2000).optional(),
});

export type UnitFormInput = z.infer<typeof unitSchema>;
