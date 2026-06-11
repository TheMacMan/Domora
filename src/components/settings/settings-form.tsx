"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { updateSettingsAction, type SettingsInput } from "@/server/actions/settings";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  defaultValues: {
    landlordName: string;
    landlordAddress: string;
    landlordPostalCode: string;
    landlordCity: string;
    landlordEmail: string;
    landlordPhone: string;
    landlordIban: string;
    landlordBic: string;
    landlordBank: string;
    destatisToken: string;
    taxNumber: string;
    taxId: string;
    taxOffice: string;
    defaultDepreciationRate: string;  // im Form als String, geleert = null
  };
};

export function SettingsForm({ defaultValues }: Props) {
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState(defaultValues);
  const [showToken, setShowToken] = useState(false);

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: SettingsInput = {
      landlordName: values.landlordName || null,
      landlordAddress: values.landlordAddress || null,
      landlordPostalCode: values.landlordPostalCode || null,
      landlordCity: values.landlordCity || null,
      landlordEmail: values.landlordEmail || null,
      landlordPhone: values.landlordPhone || null,
      landlordIban: values.landlordIban || null,
      landlordBic: values.landlordBic || null,
      landlordBank: values.landlordBank || null,
      destatisToken: values.destatisToken || null,
      taxNumber: values.taxNumber || null,
      taxId: values.taxId || null,
      taxOffice: values.taxOffice || null,
      defaultDepreciationRate: values.defaultDepreciationRate
        ? parseFloat(values.defaultDepreciationRate.replace(",", "."))
        : null,
    };
    startTransition(async () => {
      const res = await updateSettingsAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Einstellungen gespeichert");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Vermieter</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="landlordName">Name / Firma</Label>
            <Input id="landlordName" value={values.landlordName} onChange={(e) => set("landlordName", e.target.value)} disabled={isPending} placeholder="Max Mustermann" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="landlordAddress">Straße und Hausnummer</Label>
            <Input id="landlordAddress" value={values.landlordAddress} onChange={(e) => set("landlordAddress", e.target.value)} disabled={isPending} placeholder="Musterstraße 1" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="landlordPostalCode">PLZ</Label>
            <Input id="landlordPostalCode" value={values.landlordPostalCode} onChange={(e) => set("landlordPostalCode", e.target.value)} disabled={isPending} placeholder="12345" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="landlordCity">Ort</Label>
            <Input id="landlordCity" value={values.landlordCity} onChange={(e) => set("landlordCity", e.target.value)} disabled={isPending} placeholder="Musterstadt" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="landlordEmail">E-Mail</Label>
            <Input id="landlordEmail" type="email" value={values.landlordEmail} onChange={(e) => set("landlordEmail", e.target.value)} disabled={isPending} placeholder="vermieter@example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="landlordPhone">Telefon</Label>
            <Input id="landlordPhone" type="tel" value={values.landlordPhone} onChange={(e) => set("landlordPhone", e.target.value)} disabled={isPending} placeholder="+49 123 456789" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Bankverbindung</h2>
        <p className="text-xs text-muted-foreground -mt-2">Optional — wird im PDF angezeigt für Nachzahlungs-Überweisungen</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="landlordIban">IBAN</Label>
            <Input id="landlordIban" value={values.landlordIban} onChange={(e) => set("landlordIban", e.target.value)} disabled={isPending} placeholder="DE00 0000 0000 0000 0000 00" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="landlordBic">BIC</Label>
            <Input id="landlordBic" value={values.landlordBic} onChange={(e) => set("landlordBic", e.target.value)} disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="landlordBank">Kreditinstitut</Label>
            <Input id="landlordBank" value={values.landlordBank} onChange={(e) => set("landlordBank", e.target.value)} disabled={isPending} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Steuerliche Daten</h2>
        <p className="text-xs text-muted-foreground -mt-2">Optional — für Anlage-V-Export und Schriftverkehr.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="taxNumber">Steuernummer</Label>
            <Input id="taxNumber" value={values.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} disabled={isPending} placeholder="z. B. 123/456/78901" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="taxId">Steuer-Identifikationsnr.</Label>
            <Input id="taxId" value={values.taxId} onChange={(e) => set("taxId", e.target.value)} disabled={isPending} placeholder="11-stellig" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="taxOffice">Zuständiges Finanzamt</Label>
            <Input id="taxOffice" value={values.taxOffice} onChange={(e) => set("taxOffice", e.target.value)} disabled={isPending} placeholder="z. B. Finanzamt Aschaffenburg" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Defaults für neue Objekte</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="defaultDepreciationRate">Standard-AfA-Satz (%)</Label>
            <Input
              id="defaultDepreciationRate"
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={values.defaultDepreciationRate}
              onChange={(e) => set("defaultDepreciationRate", e.target.value)}
              disabled={isPending}
              placeholder="2.0"
            />
            <p className="text-xs text-muted-foreground">
              Wird als Vorbelegung in neuen Objekten verwendet. Leer = 2,0 % (linear, Standard für Gebäude nach 1925).
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">API-Zugänge</h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Destatis GENESIS-Online — wird auf <span className="font-medium">Mietentwicklung</span> für den VPI-Abruf verwendet.{" "}
          <a
            href="https://www-genesis.destatis.de/datenbank/online?Menu=Registrierung"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Token kostenlos beantragen
          </a>
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="destatisToken">Destatis-Token</Label>
          <div className="relative">
            <Input
              id="destatisToken"
              type={showToken ? "text" : "password"}
              value={values.destatisToken}
              onChange={(e) => set("destatisToken", e.target.value)}
              disabled={isPending}
              placeholder="z. B. cd9d7d77fcdb442b…"
              autoComplete="off"
              spellCheck={false}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showToken ? "Token verbergen" : "Token anzeigen"}
            >
              {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
      </section>

      <Button type="submit" loading={isPending}>Speichern</Button>
    </form>
  );
}
