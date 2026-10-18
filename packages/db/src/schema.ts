import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { accountKinds, accountStatuses, fieldTypes, permissionActions, permissionModules, permissionScopes, viewKinds } from "@wanted/shared";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    kind: text("kind", { enum: accountKinds }).notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => user.id, {
      onDelete: "restrict",
    }),
    status: text("status", { enum: accountStatuses }).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("user_parent_id_idx").on(table.parentId),
    uniqueIndex("user_single_admin_idx")
      .on(table.kind)
      .where(sql`${table.kind} = 'admin'`),
    check("user_kind_chk", sql`${table.kind} IN ('admin', 'parent', 'child')`),
    check("user_status_chk", sql`${table.status} IN ('active', 'suspended')`),
    check(
      "user_kind_parent_chk",
      sql`(${table.kind} = 'child' AND ${table.parentId} IS NOT NULL) OR (${table.kind} IN ('admin', 'parent') AND ${table.parentId} IS NULL)`,
    ),
    check(
      "user_email_domain_chk",
      sql`${table.email} ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?@wanted\\.com$'`,
    ),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const memberPermission = pgTable(
  "member_permission",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    module: text("module", { enum: permissionModules }).notNull(),
    action: text("action", { enum: permissionActions }).notNull(),
    scope: text("scope", { enum: permissionScopes }).notNull(),
  },
  (table) => [
    uniqueIndex("member_permission_unique_idx").on(table.userId, table.module, table.action),
    check("member_permission_module_chk", sql`${table.module} IN ('tables', 'crm', 'inbox', 'automations', 'members', 'settings')`),
    check(
      "member_permission_action_chk",
      sql`${table.action} IN ('view', 'create', 'edit', 'delete', 'export', 'share', 'manage')`,
    ),
    check("member_permission_scope_chk", sql`${table.scope} IN ('all', 'own', 'assigned')`),
  ],
);

export const memberTableAccess = pgTable(
  "member_table_access",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    target: text("target", { enum: ["all", "base", "table"] }).notNull(),
    targetId: text("target_id").notNull().default(""),
    createRows: boolean("create_rows").notNull().default(false),
    editRows: boolean("edit_rows").notNull().default(false),
    deleteRows: boolean("delete_rows").notNull().default(false),
    canExport: boolean("can_export").notNull().default(false),
    manage: boolean("manage").notNull().default(false),
    createTables: boolean("create_tables").notNull().default(false),
    manageSets: boolean("manage_sets").notNull().default(false),
    rowScope: text("row_scope", { enum: permissionScopes }).notNull().default("all"),
  },
  (table) => [
    uniqueIndex("member_table_access_unique_idx").on(table.userId, table.target, table.targetId),
    index("member_table_access_target_idx").on(table.target, table.targetId),
    check("member_table_access_target_chk", sql`${table.target} IN ('all', 'base', 'table')`),
    check("member_table_access_scope_chk", sql`${table.rowScope} IN ('all', 'own', 'assigned')`),
  ],
);

export const dataBase = pgTable(
  "data_base",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("data_base_parent_id_idx").on(table.parentId),
    uniqueIndex("data_base_parent_name_idx")
      .on(table.parentId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("data_base_deleted_at_idx").on(table.deletedAt),
  ],
);

export const dataTable = pgTable(
  "data_table",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    baseId: text("base_id")
      .notNull()
      .references(() => dataBase.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("data_table_parent_id_idx").on(table.parentId),
    uniqueIndex("data_table_base_name_idx")
      .on(table.baseId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("data_table_deleted_at_idx").on(table.deletedAt),
  ],
);

export const dataField = pgTable(
  "data_field",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => dataTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    fieldType: text("field_type", { enum: fieldTypes }).notNull(),
    format: text("format").notNull().default("plain"),
    options: text("options").notNull().default("[]"),
    required: boolean("required").notNull().default(false),
    isUnique: boolean("is_unique").notNull().default(false),
    defaultValue: text("default_value").notNull().default(""),
    length: integer("length"),
    position: integer("position").notNull(),
  },
  (table) => [
    index("data_field_table_id_idx").on(table.tableId),
    uniqueIndex("data_field_table_name_idx").on(table.tableId, table.name),
    check(
      "data_field_type_chk",
      sql`${table.fieldType} IN ('text', 'number', 'date', 'select', 'checkbox', 'uuid', 'json')`,
    ),
    check(
      "data_field_format_chk",
      sql`(
        (${table.fieldType} = 'text' AND ${table.format} IN ('plain', 'email', 'phone', 'url', 'long'))
        OR (${table.fieldType} = 'number' AND ${table.format} IN ('integer', 'decimal', 'currency', 'percent'))
        OR (${table.fieldType} = 'date' AND ${table.format} IN ('date', 'datetime'))
        OR (${table.fieldType} = 'select' AND ${table.format} = 'list')
        OR (${table.fieldType} = 'checkbox' AND ${table.format} = 'boolean')
        OR (${table.fieldType} = 'uuid' AND ${table.format} IN ('uuid', 'code'))
        OR (${table.fieldType} = 'json' AND ${table.format} = 'json')
      )`,
    ),
  ],
);

export const dataRow = pgTable(
  "data_row",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => dataTable.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("data_row_parent_id_idx").on(table.parentId),
    index("data_row_table_id_idx").on(table.tableId),
    index("data_row_deleted_at_idx").on(table.deletedAt),
  ],
);

export const dataCell = pgTable(
  "data_cell",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rowId: text("row_id")
      .notNull()
      .references(() => dataRow.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => dataField.id, { onDelete: "cascade" }),
    value: text("value").notNull().default(""),
  },
  (table) => [uniqueIndex("data_cell_row_field_idx").on(table.rowId, table.fieldId)],
);

export const dataView = pgTable(
  "data_view",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => dataTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: viewKinds }).notNull(),
    config: text("config").notNull().default("{}"),
    shared: boolean("shared").notNull().default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("data_view_table_id_idx").on(table.tableId),
    uniqueIndex("data_view_table_name_idx").on(table.tableId, table.name),
    check("data_view_kind_chk", sql`${table.kind} IN ('grid', 'kanban', 'calendar', 'form')`),
  ],
);

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    module: text("module").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    tone: text("tone").notNull(),
    detail: text("detail").notNull().default("{}"),
    restoredAt: timestamp("restored_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("activity_parent_created_idx").on(table.parentId, table.createdAt),
    index("activity_actor_idx").on(table.actorId),
    check("activity_tone_chk", sql`${table.tone} IN ('success', 'info', 'warning', 'error')`),
  ],
);

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  parent: one(user, {
    fields: [user.parentId],
    references: [user.id],
    relationName: "user_parent",
  }),
  children: many(user, { relationName: "user_parent" }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));