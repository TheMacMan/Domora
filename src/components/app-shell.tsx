"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/nav-link";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileSignature,
  FilePieChart,
  ClipboardList,
  Banknote,
  Receipt,
  Landmark,
  FolderOpen,
  Calculator,
  TrendingUp,
  ArrowLeftRight,
  LogOut,
  Menu,
  X,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { DomoraMark } from "@/components/icons/domora-mark";

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarContent({ userName, logoutAction }: { userName: string; logoutAction: () => void }) {
  return (
    <>
      <div className="h-14 px-4 flex items-center gap-3 border-b bg-background/60 shrink-0">
        <DomoraMark className="size-7 rounded-lg shrink-0 shadow-sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-none">Domora</p>
        </div>
        <PrivacyToggle className="size-7 shrink-0" />
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        <NavLink href="/dashboard" icon={<LayoutDashboard className="size-4 shrink-0" />}>
          Dashboard
        </NavLink>

        <NavSection label="Stammdaten">
          <NavLink href="/properties" icon={<Building2 className="size-4 shrink-0" />}>Objekte</NavLink>
          <NavLink href="/tenants" icon={<Users className="size-4 shrink-0" />}>Mieter</NavLink>
          <NavLink href="/leases" icon={<FileSignature className="size-4 shrink-0" />}>Verträge</NavLink>
        </NavSection>

        <NavSection label="Finanzen">
          <NavLink href="/payments" icon={<Banknote className="size-4 shrink-0" />}>Zahlungen</NavLink>
          <NavLink href="/expenses" icon={<Receipt className="size-4 shrink-0" />}>Ausgaben</NavLink>
          <NavLink href="/weg-statements" icon={<FilePieChart className="size-4 shrink-0" />}>WEG-Abrechnung</NavLink>
          <NavLink href="/loans" icon={<Landmark className="size-4 shrink-0" />}>Darlehen</NavLink>
          <NavLink href="/cashflow" icon={<ArrowLeftRight className="size-4 shrink-0" />}>Cashflow</NavLink>
          <NavLink href="/cpi" icon={<TrendingUp className="size-4 shrink-0" />}>Mietentwicklung</NavLink>
        </NavSection>

        <NavSection label="Steuer & Dokumente">
          <NavLink href="/documents" icon={<FolderOpen className="size-4 shrink-0" />}>Dokumente</NavLink>
          <NavLink href="/service-charges" icon={<ClipboardList className="size-4 shrink-0" />}>NK-Abrechnung</NavLink>
          <NavLink href="/tax" icon={<Calculator className="size-4 shrink-0" />}>Anlage V</NavLink>
        </NavSection>

        <NavSection label="Über">
          <NavLink href="/settings" icon={<Settings className="size-4 shrink-0" />}>Einstellungen</NavLink>
        </NavSection>
      </nav>

      <div className="px-3 py-3 border-t flex items-center gap-2 shrink-0">
        <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-semibold text-primary">
            {userName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate leading-none">{userName}</p>
        </div>
        <form action={logoutAction}>
          <Button variant="ghost" size="icon" type="submit" title="Abmelden"
            className="size-7 text-muted-foreground hover:text-foreground shrink-0">
            <LogOut className="size-3.5" />
          </Button>
        </form>
      </div>
    </>
  );
}

export function AppShell({
  userName,
  logoutAction,
  children,
}: {
  userName: string;
  logoutAction: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[220px] shrink-0 border-r bg-muted/50 flex-col">
        <SidebarContent userName={userName} logoutAction={logoutAction} />
      </aside>

      {/* Mobile drawer overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[260px] border-r bg-muted/95 backdrop-blur flex flex-col transition-transform md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent userName={userName} logoutAction={logoutAction} />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <header className="md:hidden h-14 border-b bg-background/60 backdrop-blur sticky top-0 z-30 flex items-center px-3 gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Menü schließen" : "Menü öffnen"}
            className="size-9"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <DomoraMark className="size-6 rounded-md shadow-sm" />
            <p className="text-sm font-semibold">Domora</p>
          </div>
          <PrivacyToggle />
        </header>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
