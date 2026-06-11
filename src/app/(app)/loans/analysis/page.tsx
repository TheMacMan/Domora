import Link from "next/link";
import dynamic from "next/dynamic";
import { getLoanAnalyticsAction } from "@/server/actions/loans";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const LoanAnalytics = dynamic(() => import("@/components/loan/loan-analytics").then((m) => m.LoanAnalytics), {
  loading: () => (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-5/6" />
          <div className="h-3 bg-muted rounded w-4/6" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6 h-72 animate-pulse" />
    </div>
  ),
});

export const metadata = { title: "Darlehen – Auswertung" };

export default async function LoanAuswertungPage() {
  const loans = await getLoanAnalyticsAction();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/loans"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Darlehen – Auswertung</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loans.length} Darlehen · Projektion basiert auf aktuellem Zinssatz und Rate
          </p>
        </div>
      </div>

      {loans.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
          Noch keine Darlehen erfasst.
        </div>
      ) : (
        <LoanAnalytics loans={loans} />
      )}
    </div>
  );
}
