"use server";

import { signIn, signOut } from "@/lib/auth";
import { loginSchema } from "@/lib/validators/auth";
import { AuthError } from "next-auth";

export async function loginAction(
  _prev: unknown,
  formData: FormData
): Promise<{ ok: false; error: string } | { ok: true }> {
  const raw = {
    username: formData.get("username"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Eingabe." };
  }

  try {
    await signIn("credentials", {
      username: parsed.data.username,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Benutzername oder Passwort falsch." };
    }
    throw err;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
