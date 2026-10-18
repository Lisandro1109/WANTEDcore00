import { eq } from "drizzle-orm";
import {
  grantsFromPermissions,
  permissionActions,
  permissionModules,
  type AccessRule,
  type MemberPermissions,
  type PermissionGrant,
} from "@wanted/shared";
import type { Database } from "./database.ts";
import { memberPermission, memberTableAccess, user } from "./schema.ts";

export const ownerGrants: PermissionGrant[] = permissionModules.flatMap((module) =>
  permissionActions.map((action) => ({ module, action, scope: "all" as const })),
);

export async function grantsForUser(db: Database, userId: string): Promise<PermissionGrant[]> {
  const [found] = await db.select({ kind: user.kind }).from(user).where(eq(user.id, userId)).limit(1);
  if (found?.kind === "parent") {
    return [...ownerGrants];
  }
  return db
    .select({ module: memberPermission.module, action: memberPermission.action, scope: memberPermission.scope })
    .from(memberPermission)
    .where(eq(memberPermission.userId, userId));
}

export async function accessForUser(db: Database, userId: string): Promise<AccessRule[]> {
  const rows = await db.select().from(memberTableAccess).where(eq(memberTableAccess.userId, userId));
  return rows.map((row) => ({
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
  }));
}

export async function savePermissions(db: Database, parentId: string, userId: string, permissions: MemberPermissions) {
  await db.delete(memberPermission).where(eq(memberPermission.userId, userId));
  await db.delete(memberTableAccess).where(eq(memberTableAccess.userId, userId));
  const grants = grantsFromPermissions(permissions);
  if (grants.length > 0) {
    await db.insert(memberPermission).values(grants.map((grant) => ({ id: crypto.randomUUID(), userId, ...grant })));
  }
  if (permissions.tables.length > 0) {
    await db.insert(memberTableAccess).values(
      permissions.tables.map((rule) => ({
        id: crypto.randomUUID(),
        parentId,
        userId,
        target: rule.target,
        targetId: rule.target === "all" ? "" : rule.targetId,
        createRows: rule.createRows,
        editRows: rule.editRows,
        deleteRows: rule.deleteRows,
        canExport: rule.export,
        manage: rule.manage,
        createTables: rule.createTables,
        manageSets: rule.manageSets,
        rowScope: rule.rowScope,
      })),
    );
  }
}
