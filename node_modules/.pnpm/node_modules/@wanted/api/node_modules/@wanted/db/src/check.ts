import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { verifyPassword } from "better-auth/crypto";
import * as schema from "./schema.ts";
import { account, user } from "./schema.ts";
import { readAdminSeedInput, seedAdmin } from "./seed-admin.ts";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../drizzle");

async function applyMigrations(client: PGlite) {
  const files = (await readdir(migrationsFolder))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("No hay migraciones en packages/db/drizzle.");
  }

  for (const file of files) {
    const sqlText = await readFile(join(migrationsFolder, file), "utf8");
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await client.exec(statement);
    }
  }
}

const client = new PGlite();
await applyMigrations(client);

const db = drizzle(client, { schema });
const input = readAdminSeedInput({
  ADMIN_EMAIL: "admin@wanted.com",
  ADMIN_PASSWORD: "wanted-admin-local",
  ADMIN_NAME: "Administrador",
});

const first = await seedAdmin(db, input);
const second = await seedAdmin(db, input);

if (!first.created || second.created) {
  throw new Error("La siembra del admin no es idempotente.");
}

const admins = await db.select().from(user).where(eq(user.kind, "admin"));
if (admins.length !== 1 || admins[0]?.email !== input.email) {
  throw new Error("La base no quedó con un solo admin.");
}

const [credential] = await db
  .select()
  .from(account)
  .where(eq(account.userId, admins[0].id));

if (!credential?.password) {
  throw new Error("El admin no tiene contraseña de acceso.");
}

const passwordMatches = await verifyPassword({
  password: input.password,
  hash: credential.password,
});

if (!passwordMatches) {
  throw new Error("La contraseña sembrada no verifica con Better Auth.");
}

const parentId = crypto.randomUUID();
await db.insert(user).values({
  id: parentId,
  name: "Padre de prueba",
  email: "padre@wanted.com",
  emailVerified: true,
  kind: "parent",
  status: "active",
});

await db.insert(user).values({
  id: crypto.randomUUID(),
  name: "Hijo de prueba",
  email: "hijo@wanted.com",
  emailVerified: true,
  kind: "child",
  parentId,
  status: "active",
});

const rejected: Array<Promise<unknown>> = [
  db.insert(user).values({
    id: crypto.randomUUID(),
    name: "Correo ajeno",
    email: "ajeno@gmail.com",
    emailVerified: true,
    kind: "parent",
    status: "active",
  }),
  db.insert(user).values({
    id: crypto.randomUUID(),
    name: "Otro admin",
    email: "otro-admin@wanted.com",
    emailVerified: true,
    kind: "admin",
    status: "active",
  }),
  db.insert(user).values({
    id: crypto.randomUUID(),
    name: "Hijo suelto",
    email: "suelto@wanted.com",
    emailVerified: true,
    kind: "child",
    status: "active",
  }),
  db.insert(user).values({
    id: crypto.randomUUID(),
    name: "Hijo del admin",
    email: "hijo-admin@wanted.com",
    emailVerified: true,
    kind: "child",
    parentId: admins[0].id,
    status: "active",
  }),
];

const failures = await Promise.allSettled(rejected);
if (failures.some((result) => result.status === "fulfilled")) {
  throw new Error("La base aceptó una cuenta que las reglas prohíben.");
}

console.log("Esquema, reglas de cuenta y admin sembrado verificados.");
await client.close();
