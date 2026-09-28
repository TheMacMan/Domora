import { NextRequest, NextResponse } from "next/server";
import { getAnlageVAction, getElsterAnlageVAction, getTaxPropertiesAction } from "@/server/actions/tax";
import type { BelegPosten } from "@/lib/pdf/anlage-v-pdf";
import type { DocumentProps } from "@react-pdf/renderer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const propertyId = searchParams.get("propertyId");
  const yearStr = searchParams.get("year");

  if (!propertyId || !yearStr)
    return new NextResponse("propertyId und year erforderlich", { status: 400 });

  const year = parseInt(yearStr, 10);
  if (isNaN(year)) return new NextResponse("Ungültiges Jahr", { status: 400 });

  const [ergebnis, propList, elster] = await Promise.all([
    getAnlageVAction(propertyId, year),
    getTaxPropertiesAction(),
    getElsterAnlageVAction(propertyId, year),
  ]);

  if (!ergebnis) return new NextResponse("Objekt nicht gefunden", { status: 404 });

  const property = propList.find((p) => p.id === propertyId);
  const address = property
    ? `${property.street}, ${property.postalCode} ${property.city}`
    : propertyId;

  // Dynamischer Import damit @react-pdf/renderer nie statisch gebundelt wird
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { AnlageVPdf } = await import("@/lib/pdf/anlage-v-pdf");

  // Belegliste: jeder Einzelposten der Werbungskosten mit Belegname oder „fehlt"
  const belege: BelegPosten[] = (elster?.werbungskosten ?? []).flatMap((sec) =>
    sec.entries.flatMap((entry) =>
      (entry.items ?? []).map((i) => ({
        zeile: entry.zeile,
        gruppe: entry.label,
        date: i.date,
        label: i.label,
        cents: i.cents,
        beleg: i.receipts && i.receipts.length > 0 ? i.receipts.map((r) => r.title ?? r.filename).join(", ") : null,
      })),
    ),
  );

  const element = <AnlageVPdf ergebnis={ergebnis} propertyAddress={address} belege={belege} /> as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="anlage-v-${year}-${propertyId.slice(0, 8)}.pdf"`,
    },
  });
}
