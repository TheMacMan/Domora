import { notFound } from "next/navigation";
import { getTripAction, getTripFormDataAction } from "@/server/actions/vehicles";
import { TripForm } from "@/components/trips/trip-form";

export const metadata = { title: "Fahrt bearbeiten – Domora" };

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [trip, form] = await Promise.all([getTripAction(id), getTripFormDataAction()]);
  if (!trip) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Fahrt bearbeiten</h1>
      <TripForm
        mode="edit"
        tripId={id}
        vehicles={form.vehicles}
        properties={form.properties}
        routes={form.routes}
        defaults={{
          vehicleId: trip.vehicleId,
          propertyId: trip.propertyId,
          date: trip.date,
          route: trip.route,
          km: String(trip.km).replace(".", ","),
          purpose: trip.purpose,
        }}
      />
    </div>
  );
}
