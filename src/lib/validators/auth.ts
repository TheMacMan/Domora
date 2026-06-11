import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "Benutzername erforderlich").max(64),
  password: z.string().min(1, "Passwort erforderlich").max(256),
});

export type LoginInput = z.infer<typeof loginSchema>;
