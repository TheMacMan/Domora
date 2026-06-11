"use client";

import { useEffect } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  docId: string;
  filename: string;
  mimeType: string;
  onClose: () => void;
};

export function DocumentPreview({ docId, filename, mimeType, onClose }: Props) {
  const url = `/api/documents/${docId}`;
  const isImage = mimeType.startsWith("image/");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-card rounded-xl shadow-2xl overflow-hidden w-full max-w-4xl max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
          <p className="text-sm font-medium truncate flex-1">{filename}</p>
          <a
            href={url}
            download={filename}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="size-3.5" />
            Herunterladen
          </a>
          <Button variant="ghost" size="iconSm" className=" shrink-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0 bg-muted/30">
          {isImage ? (
            <img
              src={url}
              alt={filename}
              className="block mx-auto max-w-full max-h-[82vh] object-contain p-4"
            />
          ) : (
            <iframe
              src={url}
              title={filename}
              className="w-full h-[82vh] border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
