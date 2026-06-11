import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import { db } from "@/db";
import { users } from "@/db/schema";
import { loginSchema } from "@/lib/validators/auth";
import { authConfig } from "./config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Benutzername", type: "text" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;

        const user = await db.query.users.findFirst({
          where: eq(users.username, username),
        });
        if (!user) return null;

        const valid = await verify(user.passwordHash, password);
        if (!valid) return null;

        return { id: user.id, name: user.username };
      },
    }),
  ],
});

export type AuthUser = {
  id: string;
  name: string;
};

export async function requireUser(): Promise<AuthUser> {
  const session = await auth();
  const userId = session?.user?.id;
  const userName = session?.user?.name;
  if (!userId || !userName) {
    redirect("/login");
  }
  return { id: userId, name: userName };
}
