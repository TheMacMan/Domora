import { SectionTabs } from "@/components/section-tabs";

// Reiter eines Objekts
export function PropertyTabs({ propertyId, active }: { propertyId: string; active: "overview" | "meters" }) {
  return (
    <SectionTabs
      tabs={[
        { href: `/properties/${propertyId}`, label: "Übersicht", active: active === "overview" },
        { href: `/properties/${propertyId}/meters`, label: "Zähler & Strom", active: active === "meters" },
      ]}
    />
  );
}
