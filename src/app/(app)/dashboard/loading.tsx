import { Skeleton, KpiCardsSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-3 w-72" />
      </div>
      <KpiCardsSkeleton count={4} />
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <TableSkeleton rows={4} />
      </div>
    </div>
  );
}
