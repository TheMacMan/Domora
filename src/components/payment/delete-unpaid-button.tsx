"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { deleteAllUnpaidPaymentsAction } from "@/server/actions/payments";

export function DeleteUnpaidButton() {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAllUnpaidPaymentsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const n = result.deleted ?? 0;
      toast.success(n === 0 ? "Keine unbezahlten Zahlungen vorhanden" : `${n} unbezahlte Zahlung${n === 1 ? "" : "en"} gelöscht`);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirming(true)}
        title="Alle noch nicht bezahlten Zahlungen löschen (bezahlte bleiben erhalten)"
      >
        <Trash2 className="size-4" />
        Unbezahlte löschen
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5">
      <span className="text-xs text-destructive">Wirklich alle unbezahlten löschen?</span>
      <Button type="button" size="sm" variant="destructive" loading={isPending} onClick={handleDelete} className="h-7 text-xs">
        Ja, löschen
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={isPending} className="h-7 text-xs">
        Abbrechen
      </Button>
    </div>
  );
}
