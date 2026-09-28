import { SectionTabs } from "@/components/section-tabs";

type Tab = "single" | "recurring" | "trips";

// Reiter des Bereichs „Ausgaben". Fahrzeuge sind Teil des Reiters „Fahrten".
export function ExpenseTabs({ active }: { active: Tab }) {
  return (
    <SectionTabs
      tabs={[
        { href: "/expenses", label: "Einzelbuchungen", active: active === "single" },
        { href: "/expenses/recurring", label: "Abos", active: active === "recurring" },
        { href: "/expenses/trips", label: "Fahrten", active: active === "trips" },
      ]}
    />
  );
}
