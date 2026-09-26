import Link from "next/link";
import { getTaxPropertiesAction, getElsterAnlageVAction } from "@/server/actions/tax";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/tax/copy-value";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { ElsterEntry, ElsterSection } from "@/lib/tax/elster";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export const metadata = { title: "ELSTER-Übertragung – Domora" };

function euroDisplay(euro: number) {
  return euro.toLocaleString("de-DE");
}

function ZeileBadge({ zeile }: { zeile: string }) {
  return (
    <span className="inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
      {zeile}
    </span>
  );
}

function EntryRow({ entry }: { entry: ElsterEntry }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <ZeileBadge zeile={entry.zeile} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words">{entry.label}</p>
          {entry.hint && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{entry.hint}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">exakt {formatMoney(entry.cents)}</p>
        </div>
        <CopyValue value={String(entry.euro)} display={`${euroDisplay(entry.euro)} €`} />
      </div>
      {entry.items && entry.items.length > 0 && (
        <details className="mt-2 ml-12 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {entry.items.length} {entry.items.length === 1 ? "Beleg" : "Belege"} anzeigen
          </summary>
          <ul className="mt-2 divide-y rounded-md border">
            {entry.items.map((i, idx) => (
              <li key={idx} className="flex gap-2 px-2 py-1.5">
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatDate(i.date)}
                </span>
                <span className="min-w-0 flex-1 break-words">{i.label}</span>
                <span className="shrink-0 tabular-nums">{formatMoney(i.cents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SectionCard({ section }: { section: ElsterSection }) {
  if (section.entries.length === 0 && !section.sum) return null;
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold">{section.title}</h3>
      </div>
      <div className="divide-y">
        {section.entries.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">Keine Einträge</p>
        ) : (
          section.entries.map((e, i) => <EntryRow key={i} entry={e} />)
        )}
        {section.sum && section.entries.length > 1 && (
          <div className="flex items-center gap-3 bg-muted/30 px-4 py-3 sm:px-5">
            <ZeileBadge zeile={section.sum.zeile} />
            <p className="flex-1 text-sm font-medium">{section.sum.label}</p>
            <span className="text-sm font-semibold tabular-nums">{euroDisplay(section.sum.euro)} €</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function ElsterPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string; year?: string }>;
}) {
  const { propertyId, year: yearStr } = await searchParams;
  const currentYear = new Date().getFullYear();
  const parsedYear = yearStr ? parseInt(yearStr, 10) : NaN;
  const year = Number.isInteger(parsedYear) && parsedYear >= 1990 && parsedYear <= currentYear + 1
    ? parsedYear
    : currentYear - 1;

  const propList = await getTaxPropertiesAction();
  const selectedId = propertyId ?? propList[0]?.id;
  const data = selectedId ? await getElsterAnlageVAction(selectedId, year) : null;
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/tax?propertyId=${selectedId ?? ""}&year=${year}`}>
            <ArrowLeft className="size-4" />
            Anlage V
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">ELSTER-Übertragung</h1>
        <p className="text-sm text-muted-foreground">
          Werte in der Zeilenstruktur der Anlage V. Einnahmen sind auf volle Euro abgerundet,
          Werbungskosten aufgerundet. Tippe auf einen Betrag, um ihn zu kopieren.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Objekt</span>
          <div className="flex flex-wrap gap-2">
            {propList.map((p) => (
              <Button key={p.id} asChild size="sm" variant={p.id === selectedId ? "default" : "outline"}>
                <Link href={`/tax/elster?propertyId=${p.id}&year=${year}`}>{p.street}, {p.city}</Link>
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Jahr</span>
          <div className="flex flex-wrap gap-2">
            {years.map((y) => (
              <Button key={y} asChild size="sm" variant={y === year ? "default" : "outline"}>
                <Link href={`/tax/elster?propertyId=${selectedId ?? ""}&year=${y}`}>{y}</Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {!data ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          Kein Objekt ausgewählt oder keine Daten vorhanden.
        </div>
      ) : (
        <>
          {data.warnings.length > 0 && (
            <div className="space-y-2">
              {data.warnings.map((w, i) => (
                <div key={i} className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>{w.zeile && <strong>Zeile {w.zeile}: </strong>}{w.text}</span>
                </div>
              ))}
            </div>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Allgemeine Angaben</h2>
            <div className="rounded-xl border bg-card divide-y">
              {data.allgemein.map((a) => (
                <div key={a.zeile} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <ZeileBadge zeile={a.zeile} />
                  <p className="flex-1 text-sm text-muted-foreground">{a.label}</p>
                  <CopyValue value={a.value} display={a.value} />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Einnahmen</h2>
            {data.einnahmen.map((s, i) => <SectionCard key={i} section={s} />)}
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3 sm:px-5">
              <ZeileBadge zeile="32" />
              <p className="flex-1 text-sm font-semibold">Summe der Einnahmen</p>
              <span className="font-semibold tabular-nums">{euroDisplay(data.summeEinnahmen.euro)} €</span>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Werbungskosten</h2>
            {data.werbungskosten.map((s, i) => <SectionCard key={i} section={s} />)}
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3 sm:px-5">
              <ZeileBadge zeile="83" />
              <p className="flex-1 text-sm font-semibold">Summe der Werbungskosten</p>
              <span className="font-semibold tabular-nums">{euroDisplay(data.summeWerbungskosten.euro)} €</span>
            </div>
          </section>

          <div className={`rounded-xl border px-4 py-4 sm:px-5 ${data.ueberschuss.cents < 0 ? "border-green-500/20 bg-green-500/5" : "bg-card"}`}>
            <div className="flex items-center gap-3">
              <ZeileBadge zeile="85" />
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {data.ueberschuss.cents < 0 ? "Überschuss (Verlust, mit Minuszeichen)" : "Überschuss"}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">exakt {formatMoney(data.ueberschuss.cents)}</p>
              </div>
              <span className="text-xl font-bold tabular-nums">{euroDisplay(data.ueberschuss.euro)} €</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              ELSTER berechnet die Summen (Zeilen 15, 32, 35, 48, 75, 78, 83, 85) selbst — sie dienen hier zur Kontrolle.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
