import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildTripLogData } from "@/server/trip-sync";

export const dynamic = "force-dynamic";

// Fahrtenliste als PDF (Download)
export async function GET(req: NextRequest) {
  await requireUser();
  const vehicleId = req.nextUrl.searchParams.get("vehicleId") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!/^[a-z0-9]{10,40}$/.test(vehicleId) || !Number.isInteger(year)) return new NextResponse("Ungültige Parameter", { status: 400 });

  const data = await buildTripLogData(vehicleId, year);
  if (!data) return new NextResponse("Fahrzeug nicht gefunden", { status: 404 });

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { TripLogPdf } = await import("@/lib/pdf/trip-log-pdf");
  const buffer = await renderToBuffer(TripLogPdf({ data }));
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fahrtenliste-${year}.pdf"`,
    },
  });
}
