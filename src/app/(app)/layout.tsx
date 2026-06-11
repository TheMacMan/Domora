import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/server/actions/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell userName={user.name} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
