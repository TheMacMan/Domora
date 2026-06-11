import { NextRequest, NextResponse } from "next/server";
import type { DocumentProps } from "@react-pdf/renderer";
import { getNkAbrechnungAction } from "@/server/actions/service-charges";
import { getSettingsAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; leaseAbrId: string }> }) {
  const { id, leaseAbrId } = await params;

  const [abr, settings] = await Promise.all([
    getNkAbrechnungAction(id),
    getSettingsAction(),
  ]);
  if (!abr) return new NextResponse("Abrechnung nicht gefunden", { status: 404 });

  const la = abr.leaseAbrechnungen.find((x) => x.id === leaseAbrId);
  if (!la) return new NextResponse("Mietverhältnis nicht gefunden", { status: 404 });

  const tenants = la.lease.leaseTenants.map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`);

  // monthsLabel: Vereinfachung — wir nehmen "01.01.JAHR – 31.12.JAHR" oder Teilzeitraum aus Lease
  const yStart = `${abr.year}-01-01`;
  const yEnd = `${abr.year}-12-31`;
  const fromDate = la.lease.startDate > yStart ? la.lease.startDate : yStart;
  const toDate = la.lease.endDate && la.lease.endDate < yEnd ? la.lease.endDate : yEnd;
  const monthsLabel = `${fmt(fromDate)} – ${fmt(toDate)}`;

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { NkAbrechnungPdf } = await import("@/lib/pdf/nk-abrechnung-pdf");

  const element = (
    <NkAbrechnungPdf
      landlord={{
        name: settings.landlordName,
        address: settings.landlordAddress,
        postalCode: settings.landlordPostalCode,
        city: settings.landlordCity,
        email: settings.landlordEmail,
        phone: settings.landlordPhone,
        iban: settings.landlordIban,
        bic: settings.landlordBic,
        bank: settings.landlordBank,
      }}
      property={{ street: abr.property.street, postalCode: abr.property.postalCode, city: abr.property.city }}
      unit={{ name: la.unit.name }}
      tenants={tenants}
      year={abr.year}
      monthsActive={la.monthsActive}
      monthsLabel={monthsLabel}
      positionen={la.positionen.map((p) => ({
        category: p.category,
        totalCostsCents: p.totalCostsCents,
        distributionKey: p.distributionKey,
        basisLabel: p.basisLabel,
        shareCents: p.shareCents,
      }))}
      kostenAnteilCents={la.kostenAnteilCents}
      vorauszahlungenCents={la.vorauszahlungenCents}
      saldoCents={la.saldoCents}
      isDraft={abr.status !== "finalized"}
    />
  ) as React.ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

  // Dateiname: "NK-Abrechnung-YYYY-Objekt-Name_der_Einheit.pdf"
  // Whitespace + Filename-sensitive Zeichen werden zu Unterstrichen.
  // Umlaute bleiben (Browser können UTF-8 dank filename*=UTF-8'').
  const safe = (s: string) =>
    s.trim().replace(/[\s,/\\:*?"<>|]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const filename = `NK-Abrechnung-${abr.year}-${safe(abr.property.street)}-${safe(la.unit.name)}.pdf`;
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
