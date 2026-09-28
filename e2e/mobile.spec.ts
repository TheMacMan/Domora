import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import Database from "better-sqlite3";

// Alle Hauptseiten auf dem iPhone: lädt ohne Fehler, kein seitliches Scrollen,
// Tippflächen ≥ 32 px (Hinweis), Screenshot nach e2e/screenshots/ (gitignored, echte Daten).

function ids() {
  const db = new Database("data/db.sqlite", { readonly: true });
  const one = (sql: string) => (db.prepare(sql).get() as { id: string } | undefined)?.id;
  const r = {
    property: one("select id from properties where deleted_at is null limit 1"),
    tenant: one("select id from tenants where deleted_at is null limit 1"),
    lease: one("select id from leases where deleted_at is null and end_date is null limit 1"),
    expense: one("select id from expenses where deleted_at is null and trip_id is null and schedule_id is null order by date desc limit 1"),
    schedule: one("select id from expense_schedules where deleted_at is null and due_dates is null limit 1"),
    plan: one("select id from expense_schedules where deleted_at is null and due_dates is not null limit 1"),
    trip: one("select id from trips where deleted_at is null limit 1"),
    vehicle: one("select id from vehicles where deleted_at is null limit 1"),
    weg: one("select id from weg_abrechnungen where deleted_at is null limit 1"),
    payment: one("select id from payments where deleted_at is null order by due_date desc limit 1"),
    loan: one("select id from loans where deleted_at is null limit 1"),
    meterProperty: one("select property_id as id from meters where deleted_at is null limit 1"),
  };
  db.close();
  return r;
}

const I = ids();
const year = String(new Date().getFullYear() - 1);
const PAGES: Array<[string, string | undefined]> = [
  ["dashboard", "/dashboard"],
  ["objekte", "/properties"],
  ["objekt", I.property && `/properties/${I.property}`],
  ["zaehler", I.meterProperty && `/properties/${I.meterProperty}/meters`],
  ["mieter", "/tenants"],
  ["mieter-detail", I.tenant && `/tenants/${I.tenant}`],
  ["vertraege", "/leases"],
  ["vertrag", I.lease && `/leases/${I.lease}`],
  ["zahlungen", "/payments"],
  ["zahlungen-jahr", "/payments/overview"],
  ["zahlung", I.payment && `/payments/${I.payment}/edit`],
  ["ausgaben", `/expenses?year=${year}`],
  ["ausgabe", I.expense && `/expenses/${I.expense}/edit`],
  ["ausgabe-neu", "/expenses/new"],
  ["abos", "/expenses/recurring"],
  ["abo", I.schedule && `/expenses/recurring/${I.schedule}/edit`],
  ["abschlagsplan", I.plan && `/expenses/recurring/${I.plan}/edit`],
  ["abschlagsplan-folgejahr", I.plan && `/expenses/recurring/new?copy=${I.plan}`],
  ["abo-neu", "/expenses/recurring/new"],
  ["fahrten", `/expenses/trips?year=${year}`],
  ["fahrt-neu", "/expenses/trips/new"],
  ["fahrt", I.trip && `/expenses/trips/${I.trip}/edit`],
  ["fahrzeug", I.vehicle && `/expenses/vehicles/${I.vehicle}?year=${year}`],
  ["darlehen", "/loans"],
  ["darlehen-detail", I.loan && `/loans/${I.loan}`],
  ["darlehen-analyse", "/loans/analysis"],
  ["cashflow", "/cashflow"],
  ["nk", "/service-charges"],
  ["weg", "/weg-statements"],
  ["weg-detail", I.weg && `/weg-statements/${I.weg}`],
  ["steuer", `/tax?year=${year}`],
  ["elster", `/tax/elster?year=${year}`],
  ["dokumente", "/documents"],
  ["dokumente-ohne-buchung", `/documents?year=${year}&beleg=unlinked`],
  ["vpi", "/cpi"],
  ["einstellungen", "/settings"],
];

async function audit(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    // Elemente, die über den rechten Rand ragen (Verursacher des Seitwärts-Scrollens)
    const wide: string[] = [];
    if (overflow > 1) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
          // nur innerste Verursacher: kein Kind ragt ebenfalls hinaus
          const childOut = Array.from(el.children).some((c) => c.getBoundingClientRect().right > vw + 1);
          const scroller = el.closest("[class*='overflow-x-auto'],[class*='overflow-auto']");
          if (!childOut && !scroller) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(r.right - vw)}px)`);
        }
        if (wide.length >= 5) break;
      }
    }
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a,button,input,select,textarea,summary"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      if (r.right <= 0 || r.left >= window.innerWidth) continue; // z. B. geschlossenes Menü
      // Fließtext-Links (inline) sind kein Knopf — nur Bedienelemente prüfen
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
      if (el.closest("nav[aria-label], [data-slot='sheet']") && r.height >= 28) continue;
      if (r.height < 32 || r.width < 32) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
        small.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    const inputs: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("input,select,textarea"))) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const t = (el as HTMLInputElement).type;
      if (fs < 16 && !["checkbox", "radio", "file", "hidden"].includes(t)) inputs.push(`${el.tagName.toLowerCase()}[${t}] ${fs}px`);
    }
    return { overflow, wide, small: [...new Set(small)], inputs: [...new Set(inputs)] };
  });
}

const report: Record<string, unknown> = {};

test.afterAll(() => {
  fs.mkdirSync("e2e/screenshots", { recursive: true });
  fs.writeFileSync("e2e/screenshots/report.json", JSON.stringify(report, null, 2));
});

for (const [name, url] of PAGES) {
  test(`${name}`, async ({ page }) => {
    test.skip(!url, "keine Daten");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(url!, { waitUntil: "networkidle" });
    expect(res?.status(), `${url} HTTP-Status`).toBeLessThan(400);
    expect(page.url(), "nicht auf Login umgeleitet").not.toContain("/login");
    const a = await audit(page);
    report[name] = { url, ...a, errors };
    // Sehr lange Seiten (z. B. alle Ausgaben): nur die ersten 6000 px
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot(height > 6000
      ? { path: `e2e/screenshots/${name}.png`, fullPage: true, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 6000 } }
      : { path: `e2e/screenshots/${name}.png`, fullPage: true });
    expect(errors, "JavaScript-Fehler").toEqual([]);
    expect(a.overflow, `seitliches Scrollen: ${a.wide.join(", ")}`).toBeLessThanOrEqual(1);
    expect(a.inputs, "Eingabefelder < 16px (iOS-Zoom)").toEqual([]);
  });
}
