import { SectionTabs } from "@/components/section-tabs";

type Tab = "single" | "recurring" | "trips" | "vehicles";

// Reiter des Bereichs „Ausgaben"
export function ExpenseTabs({ active }: { active: Tab }) {
  return (
    <SectionTabs
      tabs={[
        { href: "/expenses", label: "Einzelbuchungen", active: active === "single" },
        { href: "/expenses/recurring", label: "Abos (wiederkehrend)", active: active === "recurring" },
        { href: "/expenses/trips", label: "Fahrten", active: active === "trips" },
        { href: "/expenses/vehicles", label: "Fahrzeuge", active: active === "vehicles" },
      ]}
    />
  );
}
