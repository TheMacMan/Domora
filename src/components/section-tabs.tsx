import Link from "next/link";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string; active: boolean };

// Einheitliche Reiter für Bereiche mit mehreren Ansichten (z. B. Zahlungen: Monat | Jahresübersicht).
// Neue Ansichten eines Bereichs kommen hier als Reiter dazu — nicht als eigener Menüpunkt.
export function SectionTabs({ tabs, className }: { tabs: SectionTab[]; className?: string }) {
  return (
    <nav aria-label="Ansichten" className={cn("-mx-1 overflow-x-auto border-b", className)}>
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm transition-colors",
                t.active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
