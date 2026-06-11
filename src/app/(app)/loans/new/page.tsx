import { getPropertiesAction } from "@/server/actions/properties";
import { getLoansAction } from "@/server/actions/loans";
import { LoanForm } from "@/components/loan/loan-form";

export const metadata = { title: "Neues Darlehen – Domora" };

export default async function NewLoanPage() {
  const [propertyList, allLoans] = await Promise.all([getPropertiesAction(), getLoansAction()]);
  const properties = propertyList.map((p) => ({ id: p.id, street: p.street, city: p.city }));
  const bausparLoans = allLoans
    .filter((l) => l.loanType === "bauspar")
    .map((l) => ({ id: l.id, description: l.description }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Neues Darlehen</h1>
      <LoanForm mode="create" properties={properties} bausparLoans={bausparLoans} />
    </div>
  );
}
