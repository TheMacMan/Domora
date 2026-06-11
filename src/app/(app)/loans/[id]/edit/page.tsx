import { notFound } from "next/navigation";
import { getLoanAction, getLoansAction } from "@/server/actions/loans";
import { getPropertiesAction } from "@/server/actions/properties";
import { LoanForm } from "@/components/loan/loan-form";
import { toEuros } from "@/lib/money";
import type { LoanType } from "@/lib/validators/loan";

export const metadata = { title: "Darlehen bearbeiten – Domora" };

export default async function EditLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [loan, propertyList, allLoans] = await Promise.all([
    getLoanAction(id),
    getPropertiesAction(),
    getLoansAction(),
  ]);

  if (!loan) notFound();

  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));
  const bausparLoans = allLoans
    .filter((l) => l.loanType === "bauspar" && l.id !== id)
    .map((l) => ({ id: l.id, description: l.description }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Darlehen bearbeiten</h1>
      <LoanForm
        mode="edit"
        loanId={id}
        properties={properties}
        bausparLoans={bausparLoans}
        defaultValues={{
          propertyId: loan.propertyId,
          description: loan.description,
          loanType: (loan.loanType as LoanType) ?? "annuity",
          initialAmountEur: loan.initialAmountCents != null ? toEuros(loan.initialAmountCents) : undefined,
          balanceEur: toEuros(loan.balanceCents),
          interestRatePercent: loan.interestRateBps / 100,
          monthlyPaymentEur: toEuros(loan.monthlyPaymentCents),
          startDate: loan.startDate ?? undefined,
          balanceDate: loan.balanceDate,
          interestFixedUntil: loan.interestFixedUntil ?? undefined,
          replacedByLoanId: loan.replacedByLoanId ?? undefined,
          bsTotalSumEur: loan.bsTotalSumCents != null ? toEuros(loan.bsTotalSumCents) : undefined,
          bsSavingsBalanceEur: loan.bsSavingsBalanceCents != null ? toEuros(loan.bsSavingsBalanceCents) : undefined,
          bsSavingsDate: loan.bsSavingsDate ?? undefined,
          bsMonthlySavingsEur: loan.bsMonthlySavingsCents != null ? toEuros(loan.bsMonthlySavingsCents) : undefined,
          bsSavingsInterestPercent: loan.bsSavingsInterestBps != null ? loan.bsSavingsInterestBps / 100 : undefined,
          bsMinSavingsPercent: loan.bsMinSavingsPermille != null ? loan.bsMinSavingsPermille / 10 : undefined,
          bsTargetRatingNumber: loan.bsTargetRatingNumber ?? undefined,
          bsCurrentRatingNumber: loan.bsCurrentRatingNumber ?? undefined,
          bsRatingDate: loan.bsRatingDate ?? undefined,
          bsLoanInterestPercent: loan.bsLoanInterestBps != null ? loan.bsLoanInterestBps / 100 : undefined,
          bsLoanMonthlyPaymentEur: loan.bsLoanMonthlyPaymentCents != null ? toEuros(loan.bsLoanMonthlyPaymentCents) : undefined,
          notes: loan.notes ?? undefined,
        }}
      />
    </div>
  );
}
