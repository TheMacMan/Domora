import { todayLocal } from "@/lib/dates";
import {
  getVpiEntriesAction,
  getIndexLeasesAction,
  getIndexLeasePotentialAction,
  getFixedLeasePotentialAction,
  getGraduatedLeaseNextStepAction,
} from "@/server/actions/cpi";
import { VpiPageClient } from "@/components/cpi/vpi-page-client";
import { IndexLeasePotentialList } from "@/components/cpi/index-lease-potential";
import { FixedLeasePotentialList } from "@/components/cpi/fixed-lease-potential";
import { GraduatedLeaseNextStepList } from "@/components/cpi/graduated-lease-next-step";
import type { VpiMark } from "@/components/cpi/vpi-chart";

export const metadata = { title: "Mietentwicklung – Domora" };

export default async function VpiPage() {
  const [entries, indexLeases, indexPotential, fixedPotential, graduatedSteps] = await Promise.all([
    getVpiEntriesAction(),
    getIndexLeasesAction(),
    getIndexLeasePotentialAction(),
    getFixedLeasePotentialAction(),
    getGraduatedLeaseNextStepAction(),
  ]);

  const today = todayLocal();

  const marks: VpiMark[] = [];
  for (const lease of indexLeases) {
    marks.push({
      yearMonth: lease.startDate.slice(0, 7),
      label: "Start",
      color: "primary",
    });
    for (const adj of lease.rentAdjustments) {
      if (adj.effectiveDate <= today) {
        marks.push({
          yearMonth: adj.effectiveDate.slice(0, 7),
          label: "Anpassung",
          color: "orange",
        });
      }
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mietentwicklung</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verbraucherpreisindex (Basis 2020 = 100,0) und Erhöhungspotential pro Mietvertrag
          {" · "}
          <a
            href="https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Verbraucherpreisindex/_inhalt.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Quelle: Destatis
          </a>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Verbraucherpreisindex</h2>
        <VpiPageClient initialEntries={entries} marks={marks} />
      </section>

      <IndexLeasePotentialList items={indexPotential} />
      <FixedLeasePotentialList items={fixedPotential} />
      <GraduatedLeaseNextStepList items={graduatedSteps} />
    </div>
  );
}
