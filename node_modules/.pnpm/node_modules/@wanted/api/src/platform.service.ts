import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  createCredentialUser,
  EmailDomainError,
  EmailTakenError,
  InvalidAccountError,
  PasswordTooShortError,
  replaceCredentialPassword,
  session,
  user,
  type Database,
} from "@wanted/db";
import { t, type AccountStatus } from "@wanted/shared";
import { and, count, eq, inArray, max } from "drizzle-orm";
import { DB } from "./tokens.ts";

export type ParentSummary = {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  childCount: number;
  lastLoginAt: string | null;
};

@Injectable()
export class PlatformService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listParents(): Promise<ParentSummary[]> {
    const parents = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.kind, "parent"))
      .orderBy(user.createdAt);

    const childRows = await this.db
      .select({ parentId: user.parentId, total: count() })
      .from(user)
      .where(eq(user.kind, "child"))
      .groupBy(user.parentId);

    const loginRows = await this.db
      .select({ userId: session.userId, lastLoginAt: max(session.createdAt) })
      .from(session)
      .groupBy(session.userId);

    const childrenByParent = new Map(
      childRows.flatMap((row) => (row.parentId ? [[row.parentId, Number(row.total)] as const] : [])),
    );
    const loginByUser = new Map(
      loginRows.map((row) => [row.userId, row.lastLoginAt ? row.lastLoginAt.toISOString() : null]),
    );

    return parents.map((parent) => ({
      id: parent.id,
      name: parent.name,
      email: parent.email,
      status: parent.status,
      childCount: childrenByParent.get(parent.id) ?? 0,
      lastLoginAt: loginByUser.get(parent.id) ?? null,
    }));
  }

  async createParent(input: { name: string; email: string; password: string }) {
    try {
      const created = await createCredentialUser(this.db, {
        name: input.name,
        email: input.email,
        password: input.password,
        kind: "parent",
        parentId: null,
      });
      return created;
    } catch (error) {
      throw mapAccountError(error);
    }
  }

  async setParentStatus(parentId: string, status: AccountStatus) {
    const parent = await this.requireParent(parentId);
    await this.db.update(user).set({ status, updatedAt: new Date() }).where(eq(user.id, parent.id));
    if (status === "suspended") {
      await this.deleteFamilySessions(parent.id);
    }
    return { id: parent.id, status };
  }

  async resetParentAccess(parentId: string, password: string) {
    const parent = await this.requireParent(parentId);
    try {
      await replaceCredentialPassword(this.db, parent.id, password);
    } catch (error) {
      throw mapAccountError(error);
    }
    await this.deleteFamilySessions(parent.id);
    return { id: parent.id };
  }

  private async requireParent(parentId: string) {
    const [parent] = await this.db
      .select()
      .from(user)
      .where(and(eq(user.id, parentId), eq(user.kind, "parent")))
      .limit(1);
    if (!parent) {
      throw new NotFoundException(t("api.notFound"));
    }
    return parent;
  }

  private async deleteFamilySessions(parentId: string) {
    const children = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.parentId, parentId), eq(user.kind, "child")));
    const ids = [parentId, ...children.map((child) => child.id)];
    await this.db.delete(session).where(inArray(session.userId, ids));
  }
}

function mapAccountError(error: unknown): Error {
  if (error instanceof EmailTakenError) {
    return new ConflictException(error.message);
  }
  if (error instanceof EmailDomainError || error instanceof PasswordTooShortError || error instanceof InvalidAccountError) {
    return new BadRequestException(error.message);
  }
  return error instanceof Error ? error : new Error("No se pudo guardar la cuenta.");
}
