import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { todayLocal } from "@/lib/dates";

export const metadata = { title: "Fahrzeug anlegen – Domora" };

export default function NewVehiclePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Fahrzeug anlegen</h1>
      <VehicleForm
        mode="create"
        defaults={{ name: "", plate: "", fuelType: "combustion", ownership: "lease", inUseFrom: todayLocal(), inUseTo: "", notes: "" }}
      />
    </div>
  );
}
