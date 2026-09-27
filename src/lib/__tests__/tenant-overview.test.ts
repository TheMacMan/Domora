import { describe, it, expect } from "vitest";
import { tenantStatus, tenancyDuration } from "../tenant-overview";

const l = (id: string, startDate: string, endDate: string | null) => ({ id, startDate, endDate });
const today = "2026-09-27";

describe("tenantStatus", () => {
  it("aktiver Vertrag hat Vorrang, auch wenn später ein neuer folgt", () => {
    const r = tenantStatus([l("old", "2020-05-01", null), l("new", "2027-01-01", null)], today);
    expect(r).toMatchObject({ status: "active", lease: { id: "old" } });
  });
  it("Vertragsende heute zählt noch als aktiv", () => {
    expect(tenantStatus([l("a", "2021-04-01", today)], today).status).toBe("active");
  });
  it("nur künftiger Vertrag → zukünftig", () => {
    expect(tenantStatus([l("a", "2026-10-01", null)], today)).toMatchObject({ status: "future", lease: { id: "a" } });
  });
  it("beendet → zuletzt beendeter Vertrag", () => {
    const r = tenantStatus([l("a", "2018-01-01", "2020-12-31"), l("b", "2021-01-01", "2025-08-31")], today);
    expect(r).toMatchObject({ status: "ended", lease: { id: "b" } });
  });
  it("ohne Vertrag", () => {
    expect(tenantStatus([], today)).toEqual({ status: "none", lease: null });
  });
});

describe("tenancyDuration", () => {
  it("formatiert Jahre und Monate", () => {
    expect(tenancyDuration("2020-04-01", "2026-09-27")).toBe("6 J. 5 M.");
    expect(tenancyDuration("2026-02-01", "2026-09-27")).toBe("7 M.");
    expect(tenancyDuration("2018-01-01", "2025-01-15")).toBe("7 J.");
  });
});
