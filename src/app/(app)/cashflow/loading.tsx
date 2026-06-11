import { Skeleton, KpiCardsSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function CashflowLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-40" />
      </div>
      <KpiCardsSkeleton count={4} />
      <Skeleton className="h-80 w-full rounded-xl" />
      <TableSkeleton rows={6} />
    </div>
  );
}
