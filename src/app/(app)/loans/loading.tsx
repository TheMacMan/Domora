import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function LoansLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}
