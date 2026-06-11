"use client";

import { toast } from "sonner";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Zeigt Toast basierend auf dem Action-Result. Gibt das Result unverändert zurück,
// damit es weiterverarbeitet werden kann (z.B. router.push bei ok).
export function notify<T extends ActionResult>(result: T, opts?: { success?: string; error?: string }): T {
  if (result.ok) {
    toast.success(opts?.success ?? "Gespeichert");
  } else {
    toast.error(opts?.error ?? result.error);
  }
  return result;
}

export { toast };
