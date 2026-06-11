"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

type ActionResult = { ok: true } | { ok: false; error: string };

export type SettingsInput = {
  landlordName: string | null;
  landlordAddress: string | null;
  landlordPostalCode: string | null;
  landlordCity: string | null;
  landlordEmail: string | null;
  landlordPhone: string | null;
  landlordIban: string | null;
  landlordBic: string | null;
  landlordBank: string | null;
  destatisToken: string | null;
  taxNumber: string | null;
  taxId: string | null;
  taxOffice: string | null;
  defaultDepreciationRate: number | null;  // in % (z.B. 2.0)
};

export async function getSettingsAction() {
  await requireUser();
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  if (row) return row;
  // Fallback falls Singleton-Row fehlt
  await db.insert(appSettings).values({ id: "default" });
  return (await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") }))!;
}

export async function updateSettingsAction(data: SettingsInput): Promise<ActionResult> {
  const user = await requireUser();
  const before = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  if (!before) {
    await db.insert(appSettings).values({ id: "default", ...normalize(data) });
  } else {
    await db.update(appSettings).set({ ...normalize(data), updatedAt: new Date() }).where(eq(appSettings.id, "default"));
  }
  await writeAuditLog({ userId: user.id, action: "settings.update", entity: "app_settings", entityId: "default", before: before as Record<string, unknown> | undefined, after: data });
  revalidatePath("/settings");
  return { ok: true };
}

function normalize(d: SettingsInput) {
  const trim = (v: string | null) => v?.trim() || null;
  return {
    landlordName: trim(d.landlordName),
    landlordAddress: trim(d.landlordAddress),
    landlordPostalCode: trim(d.landlordPostalCode),
    landlordCity: trim(d.landlordCity),
    landlordEmail: trim(d.landlordEmail),
    landlordPhone: trim(d.landlordPhone),
    landlordIban: trim(d.landlordIban),
    landlordBic: trim(d.landlordBic),
    landlordBank: trim(d.landlordBank),
    destatisToken: trim(d.destatisToken),
    taxNumber: trim(d.taxNumber),
    taxId: trim(d.taxId),
    taxOffice: trim(d.taxOffice),
    defaultDepreciationPermille: d.defaultDepreciationRate != null
      ? Math.round(d.defaultDepreciationRate * 10)
      : null,
  };
}
