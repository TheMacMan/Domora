"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { DOCUMENT_LINK_TARGETS, documentLinks, documents, expenses, expenseSchedules, trips, vehicleCosts, vehicleYears, wegAbrechnungen, type DocumentLinkTarget } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { rankReceiptCandidates, tagForExpenseCategory, type ReceiptSource } from "@/lib/expense-receipts";
import { createDocumentLink, expenseReceipts, loadReceiptContext } from "@/server/receipt-links";

type ActionResult = { ok: true } | { ok: false; error: string };

const ID_RE = /^[a-z0-9]{10,40}$/;

function revalidateLinkViews() {
  revalidatePath("/expenses/vehicles", "layout");
  revalidatePath("/expenses", "layout");
  revalidatePath("/documents");
  revalidatePath("/weg-statements", "layout");
  revalidatePath("/tax", "layout");
  revalidatePath("/dashboard");
}

// Ziel einer Verknüpfung laden (Objekt, Jahr, Beschreibung, Kategorie) — null wenn nicht vorhanden
async function loadTarget(targetType: DocumentLinkTarget, targetId: string) {
  if (!ID_RE.test(targetId)) return null;
  if (targetType === "expense") {
    const e = await db.query.expenses.findFirst({ where: and(eq(expenses.id, targetId), isNull(expenses.deletedAt)) });
    // Fahrtkosten: Nachweis ist die Fahrtenliste → kein eigener Beleg nötig
    return e && { propertyId: e.propertyId, date: e.date, description: e.description, category: e.category, scheduleId: e.scheduleId, wegAbrechnungId: e.wegAbrechnungId, amountCents: e.tripId ? 0 : e.amountCents };
  }
  if (targetType === "expense_schedule") {
    const s = await db.query.expenseSchedules.findFirst({ where: and(eq(expenseSchedules.id, targetId), isNull(expenseSchedules.deletedAt)) });
    return s && { propertyId: s.propertyId, date: `${s.startMonth}-01`, description: s.description, category: s.category, scheduleId: null, wegAbrechnungId: null, amountCents: s.amountCents };
  }
  if (targetType === "weg_abrechnung") {
    const w = await db.query.wegAbrechnungen.findFirst({ where: and(eq(wegAbrechnungen.id, targetId), isNull(wegAbrechnungen.deletedAt)) });
    return w && { propertyId: w.propertyId, date: `${w.year}-12-31`, description: `WEG Jahresabrechnung ${w.year}`, category: "weg_saldo", scheduleId: null, wegAbrechnungId: null, amountCents: 1 };
  }
  // Fahrzeugbelege: Ablage „Allgemein", Kategorie „Beleg"
  if (targetType === "vehicle_cost") {
    const c = await db.query.vehicleCosts.findFirst({ where: and(eq(vehicleCosts.id, targetId), isNull(vehicleCosts.deletedAt)) });
    return c && { propertyId: null, date: c.date, description: c.description, category: "vehicle", scheduleId: null, wegAbrechnungId: null, amountCents: c.amountCents };
  }
  if (targetType !== "vehicle_year") return null; // Zählerstände/Preise: Belege nur per Upload
  const y = await db.query.vehicleYears.findFirst({ where: eq(vehicleYears.id, targetId), with: { vehicle: true } });
  return y && { propertyId: null, date: `${y.year}-12-31`, description: `Fahrtenliste Fahrzeug ${y.vehicle.name} ${y.year}`, category: "vehicle", scheduleId: null, wegAbrechnungId: null, amountCents: 1 };
}

export async function linkDocumentAction(documentId: string, targetType: DocumentLinkTarget, targetId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(DOCUMENT_LINK_TARGETS as readonly string[]).includes(targetType)) return { ok: false, error: "Ungültiges Ziel." };
  const [doc, target] = await Promise.all([
    db.query.documents.findFirst({ where: and(eq(documents.id, documentId), isNull(documents.deletedAt)) }),
    loadTarget(targetType, targetId),
  ]);
  if (!doc) return { ok: false, error: "Dokument nicht gefunden." };
  if (!target) return { ok: false, error: "Buchung nicht gefunden." };

  await createDocumentLink(user.id, documentId, targetType, targetId);
  revalidateLinkViews();
  return { ok: true };
}

// Nur die Verknüpfung wird gelöst (Soft-Delete) — das Dokument bleibt erhalten.
export async function unlinkDocumentAction(linkId: string): Promise<ActionResult> {
  const user = await requireUser();
  const link = await db.query.documentLinks.findFirst({ where: and(eq(documentLinks.id, linkId), isNull(documentLinks.deletedAt)) });
  if (!link) return { ok: false, error: "Verknüpfung nicht gefunden." };

  await db.update(documentLinks).set({ deletedAt: new Date() }).where(eq(documentLinks.id, linkId));
  await writeAuditLog({ userId: user.id, action: "document.unlink", entity: "document", entityId: link.documentId, before: link as Record<string, unknown> });
  revalidateLinkViews();
  return { ok: true };
}

export type ReceiptPanelDoc = { id: string; filename: string; title: string | null; mimeType: string; year: number | null };
export type ReceiptPanelData = {
  own: Array<{ linkId: string; doc: ReceiptPanelDoc }>;
  inherited: Array<{ source: Exclude<ReceiptSource, "own">; href: string; doc: ReceiptPanelDoc }>;
  suggestions: ReceiptPanelDoc[];
  others: ReceiptPanelDoc[];
  needed: boolean;
  defaults: { entityType: "property" | "general"; entityId: string; year: number; tag: string };
};

// Daten für den Abschnitt „Belege" (Ausgabe, Abo oder WEG-Abrechnung)
export async function getReceiptPanelAction(targetType: DocumentLinkTarget, targetId: string): Promise<ReceiptPanelData | null> {
  await requireUser();
  const target = await loadTarget(targetType, targetId);
  if (!target) return null;

  const [ctx, allDocs] = await Promise.all([
    loadReceiptContext(),
    db.query.documents.findMany({ where: isNull(documents.deletedAt), orderBy: (d, { desc }) => [desc(d.createdAt)] }),
  ]);
  const docById = new Map(allDocs.map((d) => [d.id, d]));
  const pick = (id: string): ReceiptPanelDoc => {
    const d = docById.get(id)!;
    return { id: d.id, filename: d.filename, title: d.title, mimeType: d.mimeType, year: d.year };
  };

  // Fahrtkosten: Link auf das Fahrzeug der Fahrt
  let tripVehicleHref = "/expenses/trips#fahrzeuge";
  if (targetType === "expense") {
    const tr = await db.query.trips.findFirst({ where: and(eq(trips.expenseId, targetId), isNull(trips.deletedAt)) });
    if (tr) tripVehicleHref = `/expenses/vehicles/${tr.vehicleId}`;
  }
  const own = (ctx.byTarget.get(`${targetType}:${targetId}`) ?? []).map((l) => ({ linkId: l.linkId, doc: pick(l.doc.id) }));
  const inherited =
    targetType === "expense"
      ? expenseReceipts({ id: targetId, scheduleId: target.scheduleId, wegAbrechnungId: target.wegAbrechnungId }, ctx)
          .filter((r) => r.source !== "own")
          .map((r) => ({
            source: r.source as Exclude<ReceiptSource, "own">,
            href:
              r.source === "schedule" ? `/expenses/recurring/${target.scheduleId}/edit`
              : r.source === "weg" ? `/weg-statements/${target.wegAbrechnungId}`
              : tripVehicleHref,
            doc: pick(r.doc.id),
          }))
      : [];

  const linkedIds = new Set([...own, ...inherited].map((x) => x.doc.id));
  // Mieter-/Vertragsunterlagen sind keine Belege für Ausgaben
  const pool = allDocs.filter((d) => !linkedIds.has(d.id) && (d.entityType === "property" || d.entityType === "general"));
  const tag = target.category === "vehicle" ? "Beleg" : tagForExpenseCategory(target.category);
  const suggestions = rankReceiptCandidates({ ...target, tag }, pool);
  const suggestionIds = new Set(suggestions.map((d) => d.id));
  const year = parseInt(target.date.slice(0, 4), 10);
  // Weitere Dokumente: gleiches Objekt oder allgemein, Belegjahr ± 1; passende Kategorie zuerst
  const others = pool
    .filter(
      (d) =>
        !suggestionIds.has(d.id) &&
        (d.entityType === "general" || target.propertyId == null || d.entityId === target.propertyId) &&
        (d.year == null || Math.abs(d.year - year) <= 1),
    )
    .sort((a, b) => Number(b.tag === tag) - Number(a.tag === tag));

  return {
    own,
    inherited,
    suggestions: suggestions.map((d) => pick(d.id)),
    others: others.map((d) => pick(d.id)),
    needed: target.amountCents !== 0,
    defaults: {
      entityType: target.propertyId ? "property" : "general",
      entityId: target.propertyId ?? "general",
      year,
      tag,
    },
  };
}
