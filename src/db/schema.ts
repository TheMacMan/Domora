import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: text("before"),
  after: text("after"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Gebäude / Objekte
export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  street: text("street").notNull(),
  postalCode: text("postal_code").notNull(),
  city: text("city").notNull(),
  yearBuilt: integer("year_built"),
  purchaseDate: text("purchase_date"), // YYYY-MM-DD
  purchasePriceTotal: integer("purchase_price_total"), // Cents
  purchasePriceLand: integer("purchase_price_land"), // Cents, Grund-/Boden-Anteil
  depreciationPermille: integer("depreciation_permille").notNull().default(20), // 20 = 2,0 %
  // Vergleichsmiete €/m² (Cents/m²) — optional, für Mietentwicklung/Erhöhungspotential
  referenceRentCentsPerSqm: integer("reference_rent_cents_per_sqm"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Wohneinheiten innerhalb eines Gebäudes
export const units = sqliteTable("units", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  name: text("name").notNull(), // z.B. "EG links", "Wohnung 2"
  floor: integer("floor"), // Etage (0 = EG)
  livingArea: real("living_area").notNull(), // m²
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Mieter
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Mietanpassungen (Staffel, Index, Neuverhandlung)
export const rentAdjustments = sqliteTable("rent_adjustments", {
  id: text("id").primaryKey(),
  leaseId: text("lease_id")
    .notNull()
    .references(() => leases.id),
  effectiveDate: text("effective_date").notNull(), // YYYY-MM-DD
  rentCents: integer("rent_cents").notNull(),
  serviceChargesCents: integer("service_charges_cents"),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Mieteingänge (Soll/Ist pro Monat und Vertrag)
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  leaseId: text("lease_id")
    .notNull()
    .references(() => leases.id),
  dueDate: text("due_date").notNull(), // YYYY-MM-01 (immer 1. des Monats)
  rentCents: integer("rent_cents").notNull(), // Soll Kaltmiete
  serviceChargesCents: integer("service_charges_cents"), // Soll NK
  paidCents: integer("paid_cents"), // Ist (null = offen)
  paidAt: text("paid_at"), // YYYY-MM-DD
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Mietverträge
export const leases = sqliteTable("leases", {
  id: text("id").primaryKey(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date"), // YYYY-MM-DD, null = unbefristet
  rentCents: integer("rent_cents").notNull(), // Kaltmiete
  serviceChargesCents: integer("service_charges_cents"), // NK-Vorauszahlung
  depositCents: integer("deposit_cents"), // Kaution (fixer Betrag)
  depositFactor: real("deposit_factor"), // Kaution als Vielfaches der Kaltmiete (z.B. 3.0)
  rentType: text("rent_type", { enum: ["fixed", "index", "graduated"] })
    .notNull()
    .default("fixed"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const RENT_COMPONENT_KINDS = ["garage", "parking", "kitchen", "furniture", "other"] as const;
export type RentComponentKind = (typeof RENT_COMPONENT_KINDS)[number];

// Zusätzliche Mietkomponenten (Garage, Stellplatz, Küche, …) — werden zur Kaltmiete addiert
export const leaseRentComponents = sqliteTable("lease_rent_components", {
  id: text("id").primaryKey(),
  leaseId: text("lease_id")
    .notNull()
    .references(() => leases.id),
  kind: text("kind", { enum: RENT_COMPONENT_KINDS }).notNull(),
  description: text("description"), // optional, z.B. "Stellplatz Nr. 3"
  amountCents: integer("amount_cents").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Mieter pro Mietvertrag (mehrere Personen möglich)
export const leaseTenants = sqliteTable("lease_tenants", {
  id: text("id").primaryKey(),
  leaseId: text("lease_id")
    .notNull()
    .references(() => leases.id),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

// VPI-Indexwerte (Verbraucherpreisindex, Basis 2020=100)
export const vpiEntries = sqliteTable("vpi_entries", {
  id: text("id").primaryKey(),
  yearMonth: text("year_month").notNull().unique(), // YYYY-MM
  value: real("value").notNull(), // z.B. 120.3 (2020=100)
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Dokumente (Belege, Ausweise, etc.) – verknüpft mit Mieter, Objekt, Vertrag
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(), // Originalname (Anzeige)
  storedName: text("stored_name").notNull(), // cuid2.ext (Disk)
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  entityType: text("entity_type").notNull(), // 'tenant' | 'property' | 'lease'
  entityId: text("entity_id").notNull(),
  tag: text("tag").notNull(), // Personalausweis | Verdienstnachweis | SCHUFA | Mietvertrag | Übergabeprotokoll | Beleg | Korrespondenz | Sonstiges
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const LOAN_TYPES = ["annuity", "interest_only", "bauspar"] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

// Darlehen pro Objekt
export const loans = sqliteTable("loans", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  description: text("description").notNull(), // z.B. "Hauptdarlehen", "KfW"
  loanType: text("loan_type").notNull().default("annuity"), // annuity | interest_only | bauspar
  initialAmountCents: integer("initial_amount_cents"),
  balanceCents: integer("balance_cents").notNull(), // Restschuld per balanceDate
  balanceDate: text("balance_date").notNull(), // YYYY-MM-DD: Stichtag der Restschuld
  interestRateBps: integer("interest_rate_bps").notNull(), // Basispunkte (1 bp = 0,01 %)
  monthlyPaymentCents: integer("monthly_payment_cents").notNull(),
  startDate: text("start_date"), // YYYY-MM-DD, ursprüngliches Darlehensdatum (optional, für Anzeige)
  interestFixedUntil: text("interest_fixed_until"), // YYYY-MM-DD, Ende der Zinsbindung
  // Vorfinanzierung → Bausparvertrag, der diese Vorfinanzierung ablöst
  replacedByLoanId: text("replaced_by_loan_id"),
  // Bauspar-spezifische Felder (nur bei loanType = "bauspar")
  bsTotalSumCents: integer("bs_total_sum_cents"), // Bausparsumme
  bsSavingsBalanceCents: integer("bs_savings_balance_cents"), // Aktuelles Sparguthaben
  bsSavingsDate: text("bs_savings_date"), // Stichtag des Sparguthabens
  bsMonthlySavingsCents: integer("bs_monthly_savings_cents"), // Monatliche Sparrate / TEL
  bsSavingsInterestBps: integer("bs_savings_interest_bps"), // Guthabenzins in Bps
  bsMinSavingsPermille: integer("bs_min_savings_permille"), // Mindestsparquote in Promille (400 = 40 %)
  bsTargetRatingNumber: real("bs_target_rating_number"), // Ziel-Bewertungszahl
  bsCurrentRatingNumber: real("bs_current_rating_number"), // Aktuelle Bewertungszahl
  bsRatingDate: text("bs_rating_date"), // Stichtag der Bewertungszahl
  bsLoanInterestBps: integer("bs_loan_interest_bps"), // Sollzins für Bauspardarlehen nach Zuteilung
  bsLoanMonthlyPaymentCents: integer("bs_loan_monthly_payment_cents"), // Rate nach Zuteilung
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Monatliche Darlehensraten mit Zins/Tilgungs-Split
export const loanPayments = sqliteTable("loan_payments", {
  id: text("id").primaryKey(),
  loanId: text("loan_id")
    .notNull()
    .references(() => loans.id),
  dueDate: text("due_date").notNull(), // YYYY-MM-01
  totalCents: integer("total_cents").notNull(),
  interestCents: integer("interest_cents").notNull(),
  principalCents: integer("principal_cents").notNull(),
  balanceAfterCents: integer("balance_after_cents").notNull(), // Restschuld nach Zahlung
  paidAt: text("paid_at"), // YYYY-MM-DD, null = offen
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Tatsächlich gezahlte Schuldzinsen pro Darlehen und Kalenderjahr — direkt aus der
// Zinsbescheinigung / dem Jahreskontoauszug der Bank. Hat in Anlage V Vorrang vor
// den aus dem Tilgungsplan (loan_payments) berechneten Zinsen (Näherung).
export const loanInterestYears = sqliteTable(
  "loan_interest_years",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id),
    year: integer("year").notNull(),
    interestCents: integer("interest_cents").notNull(), // Schuldzinsen des Jahres in Cents
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    loanYearUnique: uniqueIndex("loan_interest_years_loan_year_uq").on(t.loanId, t.year),
  }),
);

// Ausgaben-Kategorien — getrennt in umlegbare Betriebskosten (§ 2 BetrKV)
// und nicht umlegbare Werbungskosten.
export const EXPENSE_CATEGORIES = [
  // ── Umlegbare Betriebskosten nach § 2 BetrKV ──
  "bk_grundsteuer",        // 1. Öffentliche Lasten (Grundsteuer)
  "bk_wasser",             // 2. Wasserversorgung
  "bk_abwasser",           // 3. Entwässerung
  "bk_heizung",            // 4a. Heizung
  "bk_warmwasser",         // 4b. Warmwasserversorgung
  "bk_aufzug",             // 5. Aufzug
  "bk_strasse_muell",      // 6. Straßenreinigung & Müllbeseitigung
  "bk_hausreinigung",      // 7. Hausreinigung & Ungezieferbekämpfung
  "bk_gartenpflege",       // 8. Gartenpflege
  "bk_beleuchtung",        // 9. Beleuchtung (Allgemeinflächen)
  "bk_schornsteinfeger",   // 10. Schornsteinreinigung
  "bk_versicherung",       // 11. Sach- und Haftpflichtversicherung
  "bk_hauswart",           // 12. Hauswart / Hausmeister
  "bk_antenne_kabel",      // 13. Antennenanlage / Kabel
  "bk_waschkueche",        // 14. Gemeinschaftliche Wascheinrichtung
  "bk_sonstige",           // 17. Sonstige Betriebskosten (z.B. Wartung Rauchmelder)
  // ── Nicht umlegbar (nur Werbungskosten für Vermieter) ──
  "maintenance",           // Erhaltungsaufwand
  "capital_expense",       // Herstellungs-/Anschaffungsnaher Aufwand
  "administration",        // Verwaltungskosten
  "insurance_owner",       // Vermieter-Versicherungen (Rechtsschutz, Mietausfall)
  "non_allocable_other",   // Sonstige nicht umlegbare Kosten
  "other",                 // Sonstige Werbungskosten
  // ── WEG (Eigentumswohnung in Gemeinschaft) ──
  // Keine Werbungskosten / nicht umlegbar — dienen nur dem Cashflow-Tracking
  "weg_hausgeld",          // monatliche Vorauszahlung an die WEG
  "weg_saldo",             // Saldo aus WEG-Jahresabrechnung (>0 = Nachzahlung, <0 = Erstattung)
  "weg_ruecklage",         // Instandhaltungsrücklage
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Ausgaben / Werbungskosten
export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").references(() => properties.id), // null = anteilig alle Objekte
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD, Buchungs-/Zahldatum
  description: text("description"),
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  // Optional: Leistungszeitraum (z.B. Strom-Jahresrechnung 2024-01-01 bis 2024-12-31).
  // Im Cashflow wird der Betrag auf die Monate im Zeitraum verteilt.
  servicePeriodStart: text("service_period_start"), // YYYY-MM-DD
  servicePeriodEnd: text("service_period_end"),     // YYYY-MM-DD
  // Verknüpfung mit einer WEG-Jahresabrechnung. Posten mit dieser ID werden im
  // Cashflow ignoriert (das monatliche Hausgeld und der Saldo zeigen den Geldfluss),
  // aber für Anlage V und NK-Abrechnung als Werbungskosten/umlegbar genutzt.
  wegAbrechnungId: text("weg_abrechnung_id"),
  // Verknüpfung mit einem ExpenseSchedule (monatlich wiederkehrend), wenn generiert.
  scheduleId: text("schedule_id"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Wiederkehrende monatliche Ausgaben (z. B. Hausgeld). Generiert pro Monat eine `expenses`-Zeile.
export const expenseSchedules = sqliteTable("expense_schedules", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").references(() => properties.id),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  startMonth: text("start_month").notNull(), // YYYY-MM
  endMonth: text("end_month"),                // YYYY-MM (nullable = offen)
  dayOfMonth: integer("day_of_month").notNull().default(1),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export type ExpenseSchedule = typeof expenseSchedules.$inferSelect;
export type NewExpenseSchedule = typeof expenseSchedules.$inferInsert;

export const expenseSchedulesRelations = relations(expenseSchedules, ({ one, many }) => ({
  property: one(properties, { fields: [expenseSchedules.propertyId], references: [properties.id] }),
  expenses: many(expenses),
}));

export const propertiesRelations = relations(properties, ({ many }) => ({
  units: many(units),
  expenses: many(expenses),
  loans: many(loans),
  expenseSchedules: many(expenseSchedules),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  property: one(properties, { fields: [loans.propertyId], references: [properties.id] }),
  loanPayments: many(loanPayments),
  interestYears: many(loanInterestYears),
  replacedBy: one(loans, { fields: [loans.replacedByLoanId], references: [loans.id], relationName: "replacement" }),
  replaces: many(loans, { relationName: "replacement" }),
}));

export const loanPaymentsRelations = relations(loanPayments, ({ one }) => ({
  loan: one(loans, { fields: [loanPayments.loanId], references: [loans.id] }),
}));

export const loanInterestYearsRelations = relations(loanInterestYears, ({ one }) => ({
  loan: one(loans, { fields: [loanInterestYears.loanId], references: [loans.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  property: one(properties, { fields: [expenses.propertyId], references: [properties.id] }),
  schedule: one(expenseSchedules, { fields: [expenses.scheduleId], references: [expenseSchedules.id] }),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
  leases: many(leases),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  leaseTenants: many(leaseTenants),
}));

export const leasesRelations = relations(leases, ({ one, many }) => ({
  unit: one(units, { fields: [leases.unitId], references: [units.id] }),
  leaseTenants: many(leaseTenants),
  payments: many(payments),
  rentAdjustments: many(rentAdjustments),
  rentComponents: many(leaseRentComponents),
}));

export const leaseRentComponentsRelations = relations(leaseRentComponents, ({ one }) => ({
  lease: one(leases, { fields: [leaseRentComponents.leaseId], references: [leases.id] }),
}));

export const leaseTenantsRelations = relations(leaseTenants, ({ one }) => ({
  lease: one(leases, { fields: [leaseTenants.leaseId], references: [leases.id] }),
  tenant: one(tenants, { fields: [leaseTenants.tenantId], references: [tenants.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  lease: one(leases, { fields: [payments.leaseId], references: [leases.id] }),
}));

export const rentAdjustmentsRelations = relations(rentAdjustments, ({ one }) => ({
  lease: one(leases, { fields: [rentAdjustments.leaseId], references: [leases.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Lease = typeof leases.$inferSelect;
export type NewLease = typeof leases.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type RentAdjustment = typeof rentAdjustments.$inferSelect;
export type NewRentAdjustment = typeof rentAdjustments.$inferInsert;
export type LeaseTenant = typeof leaseTenants.$inferSelect;
export type VpiEntry = typeof vpiEntries.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Loan = typeof loans.$inferSelect;
export type NewLoan = typeof loans.$inferInsert;
export type LoanPayment = typeof loanPayments.$inferSelect;
export type LoanInterestYear = typeof loanInterestYears.$inferSelect;
export type NewLoanInterestYear = typeof loanInterestYears.$inferInsert;
export type NewLoanPayment = typeof loanPayments.$inferInsert;


// ── Nebenkostenabrechnung ──

export const NK_DISTRIBUTION_KEYS = ["area", "units", "consumption", "mix"] as const;
export type NkDistributionKey = (typeof NK_DISTRIBUTION_KEYS)[number];

export const nkAbrechnungen = sqliteTable("nk_abrechnungen", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  year: integer("year").notNull(),
  status: text("status", { enum: ["draft", "finalized"] }).notNull().default("draft"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const nkAbrechnungLeases = sqliteTable("nk_abrechnung_leases", {
  id: text("id").primaryKey(),
  abrechnungId: text("abrechnung_id")
    .notNull()
    .references(() => nkAbrechnungen.id),
  leaseId: text("lease_id")
    .notNull()
    .references(() => leases.id),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id),
  monthsActive: integer("months_active").notNull(),       // 1..12
  kostenAnteilCents: integer("kosten_anteil_cents").notNull(),
  vorauszahlungenCents: integer("vorauszahlungen_cents").notNull(),
  saldoCents: integer("saldo_cents").notNull(),           // > 0 = Nachzahlung, < 0 = Erstattung
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const nkAbrechnungPositionen = sqliteTable("nk_abrechnung_positionen", {
  id: text("id").primaryKey(),
  abrechnungId: text("abrechnung_id")
    .notNull()
    .references(() => nkAbrechnungen.id),
  leaseAbrechnungId: text("lease_abrechnung_id")
    .notNull()
    .references(() => nkAbrechnungLeases.id),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  totalCostsCents: integer("total_costs_cents").notNull(),  // Gesamtkosten der Kategorie im Objekt
  distributionKey: text("distribution_key", { enum: NK_DISTRIBUTION_KEYS }).notNull(),
  basisLabel: text("basis_label"),                          // z.B. "92,5 m² von 380 m²"
  shareCents: integer("share_cents").notNull(),             // Anteil dieses Lease am Jahr
  manualOverride: integer("manual_override", { mode: "boolean" }).notNull().default(false),
  // Bei distributionKey "consumption" oder "mix": Verbrauchswert dieser Wohneinheit
  // (Einheit ist neutral — kann kWh, m³ etc. sein; nur Verhältnis zählt).
  consumptionValue: real("consumption_value"),
  // Bei distributionKey "mix": Anteil Verbrauch in Promille (700 = 70 %).
  mixConsumptionPermille: integer("mix_consumption_permille"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Leerstand-Anteil pro NK-Abrechnung × Einheit × Kategorie.
// Bei festen Verteilerschlüsseln trägt der Vermieter den Leerstand selbst.
export const nkAbrechnungVacancy = sqliteTable("nk_abrechnung_vacancy", {
  id: text("id").primaryKey(),
  abrechnungId: text("abrechnung_id")
    .notNull()
    .references(() => nkAbrechnungen.id),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  vacantMonths: integer("vacant_months").notNull(),     // 1..12
  vacancyShareCents: integer("vacancy_share_cents").notNull(),
  basisLabel: text("basis_label"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const nkAbrechnungenRelations = relations(nkAbrechnungen, ({ one, many }) => ({
  property: one(properties, { fields: [nkAbrechnungen.propertyId], references: [properties.id] }),
  leaseAbrechnungen: many(nkAbrechnungLeases),
  positionen: many(nkAbrechnungPositionen),
  vacancy: many(nkAbrechnungVacancy),
}));

export const nkAbrechnungVacancyRelations = relations(nkAbrechnungVacancy, ({ one }) => ({
  abrechnung: one(nkAbrechnungen, { fields: [nkAbrechnungVacancy.abrechnungId], references: [nkAbrechnungen.id] }),
  unit: one(units, { fields: [nkAbrechnungVacancy.unitId], references: [units.id] }),
}));

export const nkAbrechnungLeasesRelations = relations(nkAbrechnungLeases, ({ one, many }) => ({
  abrechnung: one(nkAbrechnungen, { fields: [nkAbrechnungLeases.abrechnungId], references: [nkAbrechnungen.id] }),
  lease: one(leases, { fields: [nkAbrechnungLeases.leaseId], references: [leases.id] }),
  unit: one(units, { fields: [nkAbrechnungLeases.unitId], references: [units.id] }),
  positionen: many(nkAbrechnungPositionen),
}));

export const nkAbrechnungPositionenRelations = relations(nkAbrechnungPositionen, ({ one }) => ({
  abrechnung: one(nkAbrechnungen, { fields: [nkAbrechnungPositionen.abrechnungId], references: [nkAbrechnungen.id] }),
  leaseAbrechnung: one(nkAbrechnungLeases, { fields: [nkAbrechnungPositionen.leaseAbrechnungId], references: [nkAbrechnungLeases.id] }),
}));

export type NkAbrechnung = typeof nkAbrechnungen.$inferSelect;
export type NkAbrechnungLease = typeof nkAbrechnungLeases.$inferSelect;
export type NkAbrechnungPosition = typeof nkAbrechnungPositionen.$inferSelect;
export type NkAbrechnungVacancy = typeof nkAbrechnungVacancy.$inferSelect;

// App-Einstellungen (Singleton-Row, id = "default")
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  landlordName: text("landlord_name"),
  landlordAddress: text("landlord_address"),       // Straße + Nr.
  landlordPostalCode: text("landlord_postal_code"),
  landlordCity: text("landlord_city"),
  landlordEmail: text("landlord_email"),
  landlordPhone: text("landlord_phone"),
  landlordIban: text("landlord_iban"),
  landlordBic: text("landlord_bic"),
  landlordBank: text("landlord_bank"),
  // API-Token Destatis GENESIS-Online (für VPI-Abruf). Optional; Fallback ist
  // process.env.DESTATIS_TOKEN.
  destatisToken: text("destatis_token"),
  // Steuerliche Vermieter-Daten (für Anlage V + PDF-Export)
  taxNumber: text("tax_number"),                  // Steuernummer
  taxId: text("tax_id"),                          // Steueridentifikationsnummer
  taxOffice: text("tax_office"),                  // zuständiges Finanzamt
  // Default-AfA-Satz für neue Objekte. Permille (20 = 2,0 %). NULL = eingebauter Wert (20).
  defaultDepreciationPermille: integer("default_depreciation_permille"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type AppSettings = typeof appSettings.$inferSelect;

// ── WEG-Jahresabrechnung (Eigentumswohnung in einer Eigentümergemeinschaft) ──

export const wegAbrechnungen = sqliteTable("weg_abrechnungen", {
  id: text("id").primaryKey(),
  propertyId: text("property_id")
    .notNull()
    .references(() => properties.id),
  year: integer("year").notNull(),
  abrechnungsDatum: text("abrechnungs_datum").notNull(), // YYYY-MM-DD, Datum der WEG-Abrechnung
  hausgeldVorauszahlungCents: integer("hausgeld_vorauszahlung_cents").notNull(), // Σ erfasste weg_hausgeld-Ausgaben des Jahres (Snapshot)
  saldoCents: integer("saldo_cents").notNull(), // Σ Posten − Σ Vorauszahlungen; > 0 = Nachzahlung, < 0 = Erstattung
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const wegAbrechnungenRelations = relations(wegAbrechnungen, ({ one, many }) => ({
  property: one(properties, { fields: [wegAbrechnungen.propertyId], references: [properties.id] }),
  positions: many(expenses),
}));

export type WegAbrechnung = typeof wegAbrechnungen.$inferSelect;
