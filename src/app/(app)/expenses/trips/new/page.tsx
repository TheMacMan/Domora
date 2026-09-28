import { getTripAction, getTripFormDataAction } from "@/server/actions/vehicles";
import { TripForm } from "@/components/trips/trip-form";
import { todayLocal } from "@/lib/dates";

export const metadata = { title: "Fahrt erfassen – Domora" };

// ?from=<tripId> übernimmt Strecke, km, Objekt und Anlass einer vorhandenen Fahrt („Wiederholen")
export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const [form, source] = await Promise.all([getTripFormDataAction(), from ? getTripAction(from) : null]);
  const lastRoute = form.routes[0];
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
          propertyId: source?.propertyId ?? lastRoute?.propertyId ?? form.properties[0]?.id ?? "",
          date: todayLocal(),
          route: source?.route ?? "",
          km: source ? String(source.km).replace(".", ",") : "",
          purpose: source?.purpose ?? "",
        }}
      />
    </div>
  );
}
