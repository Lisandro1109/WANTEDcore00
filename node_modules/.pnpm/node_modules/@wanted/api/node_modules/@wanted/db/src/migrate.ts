import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.ts";

const { client, db } = createDb();

try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Migraciones aplicadas.");
} finally {
  await client.end();
}
