import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { encode } from "next-auth/jwt";

// Sitzung ohne Passwort: JWT mit dem AUTH_SECRET der Instanz erzeugen und als Cookie ablegen.
setup("Sitzung anlegen", async ({ baseURL }) => {
  const env = Object.fromEntries(
    fs.readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  ) as Record<string, string>;
  const db = new Database("data/db.sqlite", { readonly: true });
  const user = db.prepare("select id, username from users limit 1").get() as { id: string; username: string };
  db.close();

  const token = await encode({
    token: { sub: user.id, id: user.id, name: user.username },
    secret: env.AUTH_SECRET!,
    salt: "authjs.session-token",
    maxAge: 60 * 60,
  });
  const url = new URL(baseURL!);
  const state = {
    cookies: [{
      name: "authjs.session-token", value: token, domain: url.hostname, path: "/",
      expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" as const,
    }],
    origins: [],
  };
  fs.mkdirSync(path.join("e2e", ".auth"), { recursive: true });
  fs.writeFileSync(path.join("e2e", ".auth", "state.json"), JSON.stringify(state));
});
