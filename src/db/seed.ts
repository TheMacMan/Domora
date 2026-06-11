import { hash } from "@node-rs/argon2";
import { createId } from "@paralleldrive/cuid2";
import { db } from "./index";
import { users } from "./schema";

async function main() {
  const USERNAME = process.env.SEED_USERNAME ?? "admin";
  const PASSWORD = process.env.SEED_PASSWORD;

  if (!PASSWORD) {
    console.error("Fehler: SEED_PASSWORD muss gesetzt sein.");
    console.error("Beispiel: SEED_PASSWORD=meinPasswort pnpm db:seed");
    process.exit(1);
  }

  const passwordHash = await hash(PASSWORD, {
    algorithm: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  await db.insert(users).values({
    id: createId(),
    username: USERNAME,
    passwordHash,
  });

  console.log(`Benutzer "${USERNAME}" erfolgreich angelegt.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
