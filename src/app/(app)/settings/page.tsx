import { getSettingsAction } from "@/server/actions/settings";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata = { title: "Einstellungen – Domora" };

export default async function EinstellungenPage() {
  const settings = await getSettingsAction();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vermieter-Stammdaten — werden in PDF-Abrechnungen verwendet.
        </p>
      </div>
      <SettingsForm
        defaultValues={{
          landlordName: settings.landlordName ?? "",
          landlordAddress: settings.landlordAddress ?? "",
          landlordPostalCode: settings.landlordPostalCode ?? "",
          landlordCity: settings.landlordCity ?? "",
          landlordEmail: settings.landlordEmail ?? "",
          landlordPhone: settings.landlordPhone ?? "",
          landlordIban: settings.landlordIban ?? "",
          landlordBic: settings.landlordBic ?? "",
          landlordBank: settings.landlordBank ?? "",
          destatisToken: settings.destatisToken ?? "",
          taxNumber: settings.taxNumber ?? "",
          taxId: settings.taxId ?? "",
          taxOffice: settings.taxOffice ?? "",
          defaultDepreciationRate: settings.defaultDepreciationPermille != null
            ? (settings.defaultDepreciationPermille / 10).toString()
            : "",
        }}
      />
    </div>
  );
}
