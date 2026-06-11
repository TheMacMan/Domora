import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function LeasesLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-40" />
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}
