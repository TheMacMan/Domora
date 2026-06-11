import Link from "next/link";
import { getTenantsAction } from "@/server/actions/tenants";
import { Button } from "@/components/ui/button";
import { Private } from "@/components/private";
import { Plus, Pencil } from "lucide-react";

export const metadata = { title: "Mieter – Domora" };

export default async function TenantsPage() {
  const tenants = await getTenantsAction();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Mieter</h1>
        <Button asChild size="sm">
          <Link href="/tenants/new">
            <Plus className="size-4" />
            Neuer Mieter
          </Link>
        </Button>
      </div>

      {tenants.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>Noch keine Mieter angelegt.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/tenants/new">Ersten Mieter anlegen</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile: Card-Liste */}
          <div className="space-y-3 md:hidden">
            {tenants.map((t) => (
              <Link
                key={t.id}
                href={`/tenants/${t.id}`}
                className="block rounded-xl border bg-card px-4 py-3 active:bg-muted/30 transition-colors"
              >
                <p className="font-medium"><Private>{t.lastName}, {t.firstName}</Private></p>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {t.email && <p className="truncate"><Private>{t.email}</Private></p>}
                  {t.phone && <p><Private>{t.phone}</Private></p>}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: Tabelle */}
          <div className="hidden md:block rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">E-Mail</th>
                  <th className="text-left px-4 py-3 font-medium">Telefon</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/tenants/${t.id}`} className="hover:underline font-medium">
                        <Private>{t.lastName}, {t.firstName}</Private>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.email ? (
                        <a href={`mailto:${t.email}`} className="hover:underline"><Private>{t.email}</Private></a>
                      ) : "–"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.phone ? <Private>{t.phone}</Private> : "–"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="icon">
                        <Link href={`/tenants/${t.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
