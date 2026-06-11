import { NextRequest, NextResponse } from "next/server";
import { getAnlageVAction, getTaxPropertiesAction } from "@/server/actions/tax";
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

  const [ergebnis, propList] = await Promise.all([
    getAnlageVAction(propertyId, year),
    getTaxPropertiesAction(),
  ]);

  if (!ergebnis) return new NextResponse("Objekt nicht gefunden", { status: 404 });

  const property = propList.find((p) => p.id === propertyId);
  const address = property
    ? `${property.street}, ${property.postalCode} ${property.city}`
    : propertyId;

  // Dynamischer Import damit @react-pdf/renderer nie statisch gebundelt wird
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { AnlageVPdf } = await import("@/lib/pdf/anlage-v-pdf");

  const element = <AnlageVPdf ergebnis={ergebnis} propertyAddress={address} /> as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="anlage-v-${year}-${propertyId.slice(0, 8)}.pdf"`,
    },
  });
}
