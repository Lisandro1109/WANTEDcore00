import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { hashPassword } from "better-auth/crypto";
import { t, toAccountEmail } from "@wanted/shared";
import { account, user } from "./schema.ts";
import type * as schema from "./schema.ts";

type Database = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

const minimumPasswordLength = 8;

export type AdminSeedInput = {
  email: string;
  password: string;
  name: string;
};

export type AdminSeedResult =
  | { created: true }
  | { created: false; reason: "exists" };

export function readAdminSeedInput(env: NodeJS.ProcessEnv = process.env): AdminSeedInput {
  const rawEmail = env.ADMIN_EMAIL?.trim() ?? "";
  const email = toAccountEmail(rawEmail);
  const password = env.ADMIN_PASSWORD ?? "";
  const name = env.ADMIN_NAME?.trim() || t("admin.seedName");

  if (!rawEmail) {
    throw new Error(t("seed.missingEmail"));
  }
  if (!email) {
    throw new Error(t("seed.emailDomain"));
  }
  if (!password) {
    throw new Error(t("seed.missingPassword"));
  }
  if (password.length < minimumPasswordLength) {
    throw new Error(t("seed.passwordTooShort"));
  }

  return { email, password, name };
}

export async function seedAdmin(
  db: Database,
  input: AdminSeedInput,
): Promise<AdminSeedResult> {
  const [existingAdmin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.kind, "admin"))
    .limit(1);

  if (existingAdmin) {
    return { created: false, reason: "exists" };
  }

  const [emailTaken] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, input.email))
    .limit(1);

  if (emailTaken) {
    throw new Error(t("seed.emailTaken"));
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const password = await hashPassword(input.password);

  await db.insert(user).values({
    id,
    name: input.name,
    email: input.email,
    emailVerified: true,
    kind: "admin",
    parentId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password,
    createdAt: now,
    updatedAt: now,
  });

  return { created: true };
}
