import { LoginForm } from "./login-form";
import { DomoraMark } from "@/components/icons/domora-mark";

export const metadata = {
  title: "Anmelden – Domora",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <DomoraMark className="inline-block size-12 rounded-2xl shadow-md mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">Domora</h1>
          <p className="text-muted-foreground mt-1 text-sm">Melde dich mit deinen Zugangsdaten an.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
