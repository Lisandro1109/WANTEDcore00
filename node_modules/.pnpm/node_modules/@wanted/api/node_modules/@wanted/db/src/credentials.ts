import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { minimumPasswordLength, t, toAccountEmail } from "@wanted/shared";
import type { Database } from "./database.ts";
import { account, user } from "./schema.ts";

export class EmailTakenError extends Error {
  constructor() {
    super(t("parents.emailTaken"));
  }
}

export class PasswordTooShortError extends Error {
  constructor() {
    super(t("auth.passwordTooShort"));
  }
}

export class InvalidAccountError extends Error {
  constructor() {
    super(t("api.invalidBody"));
  }
}

export class EmailDomainError extends Error {
  constructor() {
    super(t("auth.emailInvalid"));
  }
}

type CredentialInput = {
  name: string;
  email: string;
  password: string;
  kind: "parent" | "child";
  parentId: string | null;
};

export async function createCredentialUser(db: Database, input: CredentialInput) {
  const name = input.name.trim();
  const email = toAccountEmail(input.email);

  if (!name) {
    throw new InvalidAccountError();
  }
  if (!email) {
    throw new EmailDomainError();
  }
  if (input.password.length < minimumPasswordLength) {
    throw new PasswordTooShortError();
  }
  if (input.kind === "parent" && input.parentId) {
    throw new InvalidAccountError();
  }
  if (input.kind === "child" && !input.parentId) {
    throw new InvalidAccountError();
  }

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) {
    throw new EmailTakenError();
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const password = await hashPassword(input.password);

  try {
    await db.insert(user).values({
      id,
      name,
      email,
      emailVerified: true,
      kind: input.kind,
      parentId: input.parentId,
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
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EmailTakenError();
    }
    throw error;
  }

  return { id, name, email };
}

export async function replaceCredentialPassword(db: Database, userId: string, password: string) {
  if (password.length < minimumPasswordLength) {
    throw new PasswordTooShortError();
  }

  const hashed = await hashPassword(password);
  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  if (!existing) {
    throw new InvalidAccountError();
  }

  await db
    .update(account)
    .set({ password: hashed, updatedAt: new Date() })
    .where(eq(account.id, existing.id));
}

function isUniqueViolation(error: unknown): boolean {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "23505");
}
