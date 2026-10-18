import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireDatabaseUrl } from "./env.ts";
import * as schema from "./schema.ts";

export function createDb(url = requireDatabaseUrl()) {
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });
  return { client, db };
}
