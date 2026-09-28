import { redirect } from "next/navigation";

// Fahrzeuge sind Teil des Reiters „Fahrten" (Abschnitt „Fahrzeuge")
export default function VehiclesPage() {
  redirect("/expenses/trips#fahrzeuge");
}
