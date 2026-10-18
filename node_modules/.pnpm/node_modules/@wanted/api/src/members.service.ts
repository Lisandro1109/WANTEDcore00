import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  accessForUser,
  createCredentialUser,
  dataBase,
  dataTable,
  EmailDomainError,
  EmailTakenError,
  grantsForUser,
  InvalidAccountError,
  memberPermission,
  memberTableAccess,
  ownerGrants,
  PasswordTooShortError,
  replaceCredentialPassword,
  savePermissions,
  session,
  user,
  type Database,
} from "@wanted/db";
import {
  capsCover,
  capsForBase,
  capsForTable,
  fullCaps,
  hasGrant,
  memberLevelRank,
  permissionsFromGrants,
  ruleFor,
  sectionKeys,
  t,
  toAccountEmail,
  type AccessRule,
  type MemberLevel,
  type MemberPermissions,
  type PermissionAction,
  type PermissionGrant,
  type PermissionModule,
  type SectionKey,
  type TableCaps,
} from "@wanted/shared";
import type { Actor } from "./actor.ts";
import { DB } from "./tokens.ts";

type Limits = {
  owner: boolean;
  sections: SectionKey[];
  members: MemberLevel;
  rules: AccessRule[];
};

@Injectable()
export class MembersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async describe(actor: Actor) {
    const grants = await this.grants(actor);
    if (actor.kind === "parent") {
      return { grants, manageSets: true };
    }
    const rules = await accessForUser(this.db, actor.userId);
    return { grants, manageSets: Boolean(ruleFor(rules, "all")?.manageSets) };
  }

  async listMembers(actor: Actor) {
    const parentId = requiredParentId(actor);
    await this.assertAny(actor, [
      ["members", "view"],
      ["members", "create"],
      ["members", "manage"],
    ]);
    const children = await this.db
      .select({ id: user.id, name: user.name, email: user.email, status: user.status })
      .from(user)
      .where(and(eq(user.parentId, parentId), eq(user.kind, "child")))
      .orderBy(user.createdAt);
    if (children.length === 0) {
      return [];
    }
    const ids = children.map((child) => child.id);
    const grantRows = await this.db
      .select({
        userId: memberPermission.userId,
        module: memberPermission.module,
        action: memberPermission.action,
        scope: memberPermission.scope,
      })
      .from(memberPermission)
      .where(inArray(memberPermission.userId, ids));
    const accessRows = await this.db.select().from(memberTableAccess).where(inArray(memberTableAccess.userId, ids));
    return children.map((child) => {
      const grants = grantRows.filter((row) => row.userId === child.id);
      const base = permissionsFromGrants(grants);
      const tables = accessRows
        .filter((row) => row.userId === child.id)
        .map((row) => toRule(row));
      return { ...child, permissions: { ...base, tables } satisfies MemberPermissions };
    });
  }

  // Conjuntos y tablas que quien edita puede repartir, con el máximo que puede dar en cada uno.
  async accessOptions(actor: Actor) {
    const parentId = requiredParentId(actor);
    await this.assertAny(actor, [
      ["members", "create"],
      ["members", "manage"],
    ]);
    const limits = await this.limits(actor);
    const bases = await this.db
      .select({ id: dataBase.id, name: dataBase.name })
      .from(dataBase)
      .where(and(eq(dataBase.parentId, parentId), isNull(dataBase.deletedAt)))
      .orderBy(asc(dataBase.createdAt));
    const tables = await this.db
      .select({ id: dataTable.id, name: dataTable.name, baseId: dataTable.baseId })
      .from(dataTable)
      .where(and(eq(dataTable.parentId, parentId), isNull(dataTable.deletedAt)))
      .orderBy(asc(dataTable.createdAt));
    const allCaps = limits.owner ? fullCaps : (ruleFor(limits.rules, "all") ?? null);
    const options = bases
      .map((base) => {
        const baseCaps = limits.owner ? fullCaps : capsForBase(limits.rules, base.id);
        const baseTables = tables
          .filter((table) => table.baseId === base.id)
          .map((table) => ({
            id: table.id,
            name: table.name,
            caps: limits.owner ? fullCaps : capsForTable(limits.rules, base.id, table.id),
          }))
          .filter((table) => table.caps !== null);
        return { id: base.id, name: base.name, caps: baseCaps, tables: baseTables };
      })
      .filter((base) => base.caps !== null || base.tables.length > 0);
    return {
      sections: limits.sections,
      members: limits.members,
      all: allCaps,
      bases: options,
    };
  }

  async createChild(
    actor: Actor,
    input: { name: string; email: string; password: string; permissions: MemberPermissions },
  ) {
    const parentId = requiredParentId(actor);
    await this.assertAny(actor, [
      ["members", "create"],
      ["members", "manage"],
    ]);
    const permissions = await this.checkPermissions(actor, parentId, input.permissions);
    try {
      const created = await createCredentialUser(this.db, {
        name: input.name,
        email: input.email,
        password: input.password,
        kind: "child",
        parentId,
      });
      await savePermissions(this.db, parentId, created.id, permissions);
      return { id: created.id, name: created.name, email: created.email };
    } catch (error) {
      throw mapAccountError(error);
    }
  }

  async updateChild(
    actor: Actor,
    childId: string,
    input: { name: string; email: string; password: string; permissions: MemberPermissions },
  ) {
    const parentId = requiredParentId(actor);
    await this.assert(actor, "members", "manage");
    const child = await this.requireChild(parentId, childId);
    if (child.id === actor.userId) {
      throw new ForbiddenException(t("settings.selfLocked"));
    }
    const permissions = await this.checkPermissions(actor, parentId, input.permissions);

    const name = input.name.trim();
    const email = toAccountEmail(input.email);
    if (!name) {
      throw new BadRequestException(t("api.invalidBody"));
    }
    if (!email) {
      throw new BadRequestException(t("auth.emailInvalid"));
    }
    if (email !== child.email) {
      const [taken] = await this.db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
      if (taken) {
        throw new ConflictException(t("parents.emailTaken"));
      }
    }

    try {
      await this.db.update(user).set({ name, email, updatedAt: new Date() }).where(eq(user.id, child.id));
    } catch (error) {
      if (isUnique(error)) {
        throw new ConflictException(t("parents.emailTaken"));
      }
      throw error;
    }

    await savePermissions(this.db, parentId, child.id, permissions);

    const password = input.password.trim();
    if (password) {
      try {
        await replaceCredentialPassword(this.db, child.id, password);
      } catch (error) {
        throw mapAccountError(error);
      }
      await this.db.delete(session).where(eq(session.userId, child.id));
    }

    return { id: child.id, name, email };
  }

  async setChildStatus(actor: Actor, childId: string, status: "active" | "suspended") {
    const parentId = requiredParentId(actor);
    await this.assert(actor, "members", "manage");
    const child = await this.requireChild(parentId, childId);
    if (child.id === actor.userId) {
      throw new ForbiddenException(t("settings.selfLocked"));
    }
    await this.db.update(user).set({ status, updatedAt: new Date() }).where(eq(user.id, child.id));
    if (status === "suspended") {
      await this.db.delete(session).where(eq(session.userId, child.id));
    }
    return { id: child.id, status };
  }

  async resetChildAccess(actor: Actor, childId: string, password: string) {
    const parentId = requiredParentId(actor);
    await this.assert(actor, "members", "manage");
    const child = await this.requireChild(parentId, childId);
    try {
      await replaceCredentialPassword(this.db, child.id, password);
    } catch (error) {
      throw mapAccountError(error);
    }
    await this.db.delete(session).where(eq(session.userId, child.id));
    return { id: child.id };
  }

  private async limits(actor: Actor): Promise<Limits> {
    if (actor.kind === "parent") {
      return { owner: true, sections: [...sectionKeys], members: "manage", rules: [] };
    }
    const grants = await grantsForUser(this.db, actor.userId);
    const own = permissionsFromGrants(grants);
    const rules = own.sections.includes("tables") ? await accessForUser(this.db, actor.userId) : [];
    return { owner: false, sections: own.sections, members: own.members, rules };
  }

  // Quita conjuntos o tablas ajenos al padre y rechaza dar más acceso del que tiene quien edita.
  private async checkPermissions(actor: Actor, parentId: string, permissions: MemberPermissions) {
    const limits = await this.limits(actor);
    if (!limits.owner) {
      if (!permissions.sections.every((section) => limits.sections.includes(section))) {
        throw new ForbiddenException(t("settings.overLimit"));
      }
      if (memberLevelRank(permissions.members) > memberLevelRank(limits.members)) {
        throw new ForbiddenException(t("settings.overLimit"));
      }
    }
    const baseIds = permissions.tables.filter((rule) => rule.target === "base").map((rule) => rule.targetId);
    const tableIds = permissions.tables.filter((rule) => rule.target === "table").map((rule) => rule.targetId);
    const bases =
      baseIds.length > 0
        ? await this.db
            .select({ id: dataBase.id })
            .from(dataBase)
            .where(and(eq(dataBase.parentId, parentId), inArray(dataBase.id, baseIds)))
        : [];
    const tables =
      tableIds.length > 0
        ? await this.db
            .select({ id: dataTable.id, baseId: dataTable.baseId })
            .from(dataTable)
            .where(and(eq(dataTable.parentId, parentId), inArray(dataTable.id, tableIds)))
        : [];
    const knownBases = new Set(bases.map((base) => base.id));
    const tableBase = new Map(tables.map((table) => [table.id, table.baseId]));
    const rules = permissions.tables.filter((rule) =>
      rule.target === "all" ? true : rule.target === "base" ? knownBases.has(rule.targetId) : tableBase.has(rule.targetId),
    );
    if (!limits.owner) {
      for (const rule of rules) {
        const have: TableCaps | null =
          rule.target === "all"
            ? ruleFor(limits.rules, "all")
            : rule.target === "base"
              ? capsForBase(limits.rules, rule.targetId)
              : capsForTable(limits.rules, tableBase.get(rule.targetId) ?? "", rule.targetId);
        if (!have || !capsCover(have, rule)) {
          throw new ForbiddenException(t("settings.overLimit"));
        }
      }
    }
    return { ...permissions, tables: permissions.sections.includes("tables") ? rules : [] };
  }

  private async grants(actor: Actor): Promise<PermissionGrant[]> {
    if (actor.kind === "parent") {
      return [...ownerGrants];
    }
    return grantsForUser(this.db, actor.userId);
  }

  private async assert(actor: Actor, module: PermissionModule, action: PermissionAction) {
    await this.assertAny(actor, [[module, action]]);
  }

  private async assertAny(actor: Actor, checks: Array<[PermissionModule, PermissionAction]>) {
    if (actor.kind === "parent") {
      return;
    }
    const grants = await grantsForUser(this.db, actor.userId);
    if (!checks.some(([module, action]) => hasGrant(grants, module, action))) {
      throw new ForbiddenException(t("api.forbidden"));
    }
  }

  private async requireChild(parentId: string, childId: string) {
    const [child] = await this.db
      .select()
      .from(user)
      .where(and(eq(user.id, childId), eq(user.parentId, parentId), eq(user.kind, "child")))
      .limit(1);
    if (!child) {
      throw new NotFoundException(t("members.notFound"));
    }
    return child;
  }
}

function toRule(row: typeof memberTableAccess.$inferSelect): AccessRule {
  return {
    target: row.target,
    targetId: row.targetId,
    createRows: row.createRows,
    editRows: row.editRows,
    deleteRows: row.deleteRows,
    export: row.canExport,
    manage: row.manage,
    createTables: row.createTables,
    manageSets: row.manageSets,
    rowScope: row.rowScope,
  };
}

function requiredParentId(actor: Actor) {
  if (!actor.parentId) {
    throw new ForbiddenException(t("api.forbidden"));
  }
  return actor.parentId;
}

function mapAccountError(error: unknown): Error {
  if (error instanceof EmailTakenError) {
    return new ConflictException(error.message);
  }
  if (error instanceof EmailDomainError || error instanceof PasswordTooShortError || error instanceof InvalidAccountError) {
    return new BadRequestException(error.message);
  }
  return error instanceof Error ? error : new Error(t("api.invalidBody"));
}

function isUnique(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "23505");
}
