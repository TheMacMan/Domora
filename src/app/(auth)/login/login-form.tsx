"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initialState = undefined;

export function LoginForm() {
  const [state, action, isPending] = useActionState(loginAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anmelden</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          {state && !state.ok && (
            <div
              role="alert"
              className="rounded-md bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Benutzername</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isPending}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full mt-2">
            {isPending ? "Anmelden…" : "Anmelden"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
