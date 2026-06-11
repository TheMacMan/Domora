import { z } from "zod";

export const LOAN_TYPES = ["annuity", "interest_only", "bauspar"] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

const dateOptional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum")
  .optional()
  .or(z.literal(""));

const dateRequired = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum");

const optionalNumber = z
  .number()
  .optional()
  .or(z.nan().transform(() => undefined as number | undefined));

export const loanSchema = z
  .object({
    propertyId: z.string().min(1, "Objekt erforderlich"),
    description: z.string().min(1, "Bezeichnung erforderlich").max(200),
    loanType: z.enum(LOAN_TYPES),
    initialAmountEur: optionalNumber,
    balanceEur: z.number({ required_error: "Restschuld erforderlich" }).nonnegative(),
    interestRatePercent: z
      .number({ required_error: "Zinssatz erforderlich" })
      .min(0)
      .max(30, "Zinssatz max. 30 %"),
    monthlyPaymentEur: z.number({ required_error: "Monatliche Rate erforderlich" }).positive(),
    startDate: dateOptional,
    balanceDate: dateRequired,
    interestFixedUntil: dateOptional,
    notes: z.string().max(2000).optional(),

    // Vorfinanzierung → verknüpfter Bausparvertrag
    replacedByLoanId: z.string().optional().or(z.literal("")),

    // Bauspar-Felder (nur bei loanType = "bauspar" relevant, alle optional)
    bsTotalSumEur: optionalNumber,
    bsSavingsBalanceEur: optionalNumber,
    bsSavingsDate: dateOptional,
    bsMonthlySavingsEur: optionalNumber,
    bsSavingsInterestPercent: optionalNumber,
    bsMinSavingsPercent: optionalNumber,
    bsTargetRatingNumber: optionalNumber,
    bsCurrentRatingNumber: optionalNumber,
    bsRatingDate: dateOptional,
    bsLoanInterestPercent: optionalNumber,
    bsLoanMonthlyPaymentEur: optionalNumber,
  })
  .superRefine((data, ctx) => {
    if (data.loanType === "bauspar") {
      if (data.bsTotalSumEur == null || data.bsTotalSumEur <= 0) {
        ctx.addIssue({ code: "custom", path: ["bsTotalSumEur"], message: "Bausparsumme erforderlich" });
      }
      if (data.bsMonthlySavingsEur == null || data.bsMonthlySavingsEur < 0) {
        ctx.addIssue({ code: "custom", path: ["bsMonthlySavingsEur"], message: "Sparrate erforderlich" });
      }
    }
  });

export type LoanFormInput = z.infer<typeof loanSchema>;
