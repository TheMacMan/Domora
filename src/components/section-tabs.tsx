import Link from "next/link";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string; active: boolean };

// Einheitliche Reiter für Bereiche mit mehreren Ansichten (z. B. Zahlungen: Monat | Jahresübersicht).
// Neue Ansichten eines Bereichs kommen hier als Reiter dazu — nicht als eigener Menüpunkt.
export function SectionTabs({ tabs, className }: { tabs: SectionTab[]; className?: string }) {
  return (
    // overflow-y-hidden + ausgeblendete Scrollbar: auf schmalen Displays waagerecht wischbar,
    // ohne dass eine (senkrechte) Scrollleiste neben den Reitern erscheint
    <nav
      aria-label="Ansichten"
      className={cn(
        "-mx-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center border-b-2 px-3 text-sm transition-colors",
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
