import { getLastTripAction, getTripAction, getTripFormDataAction } from "@/server/actions/vehicles";
import { TripForm } from "@/components/trips/trip-form";
import { todayLocal } from "@/lib/dates";

export const metadata = { title: "Fahrt erfassen – Domora" };

// ?from=<tripId> übernimmt Strecke, km, Objekt und Anlass einer vorhandenen Fahrt („Wiederholen")
export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const [form, source, last] = await Promise.all([getTripFormDataAction(), from ? getTripAction(from) : null, getLastTripAction()]);
  // Ohne Vorlage: Strecke, km und Objekt der letzten Fahrt vorschlagen — Datum und Anlass bleiben offen
  const base = source ?? last;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{source ? "Fahrt wiederholen" : "Fahrt erfassen"}</h1>
      <TripForm
        mode="create"
        vehicles={form.vehicles}
        properties={form.properties}
        routes={form.routes}
        defaults={{
          vehicleId: "",
          propertyId: base?.propertyId ?? form.routes[0]?.propertyId ?? form.properties[0]?.id ?? "",
          date: todayLocal(),
          route: base?.route ?? "",
          km: base ? String(base.km).replace(".", ",") : "",
          purpose: source?.purpose ?? "",
        }}
      />
    </div>
  );
}
