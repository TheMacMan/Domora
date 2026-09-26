"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Wert für ELSTER in die Zwischenablage kopieren (ohne Tausenderpunkt, wie ELSTER ihn erwartet)
export function CopyValue({ value, display }: { value: string; display: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Zwischenablage nicht verfügbar (z. B. ohne HTTPS) — Wert bleibt markierbar
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mr-2 font-semibold tabular-nums hover:bg-muted transition-colors"
      title="In die Zwischenablage kopieren"
    >
      <span className="select-all">{display}</span>
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5 text-muted-foreground" />}
    </button>
  );
}
