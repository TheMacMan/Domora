import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isPreviewable } from "@/lib/validators/document";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });

  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const filePath = path.join(
    process.cwd(),
    "data",
    "uploads",
    doc.entityType,
    doc.entityId,
    doc.storedName
  );

  let blob: Blob;
  try {
    const buf = await readFile(filePath);
    blob = new Blob([buf], { type: doc.mimeType });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }

  // PDF/Bilder inline (Vorschau), Office/CSV/Text immer als Download
  const disposition = isPreviewable(doc.mimeType) ? "inline" : "attachment";
  return new NextResponse(blob, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(doc.sizeBytes),
      "Cache-Control": "private, no-store",
    },
  });
}
