import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import {
  accessForUser,
  dataBase,
  dataCell,
  dataField,
  dataRow,
  dataTable,
  dataView,
  grantsForUser,
  memberTableAccess,
  user,
  type Database,
} from "@wanted/db";
import {
  capsForBase,
  capsForTable,
  clampIdLength,
  coerceFormat,
  emptyViewConfig,
  fullCaps,
  normalizeStoredValue,
  readViewConfig,
  ruleFor,
  t,
  type AccessRule,
  type FieldType,
  type PermissionScope,
  type TableCaps,
  type ViewConfig,
  type ViewKind,
} from "@wanted/shared";
import type { Actor } from "./actor.ts";
import { DB } from "./tokens.ts";

type Grantee = { owner: boolean; rules: AccessRule[] };
type CapFlag = "createRows" | "editRows" | "deleteRows" | "export" | "manage" | "createTables" | "manageSets";

const maxRows = 50_000;
const maxColumns = 100;
const importChunk = 100;
const pageDefault = 80;
const pageChunk = 150;
const pageMax = 500;
const restoreWindowMs = 24 * 60 * 60 * 1000;
const purgeEveryMs = 30 * 60 * 1000;

function restoreUntil(deletedAt: Date) {
  return new Date(deletedAt.getTime() + restoreWindowMs).toISOString();
}

function canRestore(deletedAt: Date | null) {
  return deletedAt != null && Date.now() - deletedAt.getTime() < restoreWindowMs;
}

function freeName(taken: Set<string>, name: string, suffix: string) {
  if (!taken.has(name.toLowerCase())) {
    return name;
  }
  for (let index = 1; index < 1000; index += 1) {
    const tail = index === 1 ? ` (${suffix})` : ` (${suffix} ${index})`;
    const next = `${name.slice(0, 80 - tail.length)}${tail}`;
    if (!taken.has(next.toLowerCase())) {
      return next;
    }
  }
  throw new ConflictException(t("tables.nameTaken"));
}

function clampPage(value: number | undefined, fallback: number, max: number) {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.floor(value)));
}

type FieldInput = {
  name: string;
  description: string;
  fieldType: FieldType;
  format: string;
  options: string[];
  required: boolean;
  unique: boolean;
  defaultValue: string;
  length?: number | null;
};

type FieldRow = {
  id: string;
  name: string;
  description: string;
  fieldType: FieldType;
  format: string;
  options: string;
  required: boolean;
  isUnique: boolean;
  defaultValue: string;
  length: number | null;
  position: number;
};

type PlannedCell = { field: FieldRow; value: string };

type RowRecord = {
  id: string;
  createdBy: string | null;
  assigneeId: string | null;
  cells: Record<string, string>;
};

@Injectable()
export class TablesService implements OnModuleInit, OnModuleDestroy {
  private purgeTimer: ReturnType<typeof setInterval> | null = null;
  private purgeStart: ReturnType<typeof setTimeout> | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  onModuleInit() {
    const run = () => {
      this.purgeDeleted().catch((error) => console.error("purge", error));
    };
    this.purgeStart = setTimeout(run, 10_000);
    this.purgeTimer = setInterval(run, purgeEveryMs);
  }

  onModuleDestroy() {
    if (this.purgeStart) {
      clearTimeout(this.purgeStart);
    }
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
    }
  }

  async purgeDeleted() {
    const cutoff = new Date(Date.now() - restoreWindowMs);
    const expiredBases = this.db
      .select({ id: dataBase.id })
      .from(dataBase)
      .where(and(isNotNull(dataBase.deletedAt), lt(dataBase.deletedAt, cutoff)));
    const expiredTables = await this.db
      .select({ id: dataTable.id })
      .from(dataTable)
      .where(
        or(
          and(isNotNull(dataTable.deletedAt), lt(dataTable.deletedAt, cutoff)),
          inArray(dataTable.baseId, expiredBases),
        ),
      );
    for (const table of expiredTables) {
      await this.purgeTable(table.id);
    }
    const goneBases = await this.db
      .select({ id: dataBase.id })
      .from(dataBase)
      .where(and(isNotNull(dataBase.deletedAt), lt(dataBase.deletedAt, cutoff)));
    if (goneBases.length > 0) {
      await this.db.delete(memberTableAccess).where(
        and(
          eq(memberTableAccess.target, "base"),
          inArray(
            memberTableAccess.targetId,
            goneBases.map((base) => base.id),
          ),
        ),
      );
    }
    await this.db.delete(dataBase).where(and(isNotNull(dataBase.deletedAt), lt(dataBase.deletedAt, cutoff)));
    const expiredRows = this.db
      .select({ id: dataRow.id })
      .from(dataRow)
      .where(and(isNotNull(dataRow.deletedAt), lt(dataRow.deletedAt, cutoff)));
    await this.db.delete(dataCell).where(inArray(dataCell.rowId, expiredRows));
    await this.db.delete(dataRow).where(and(isNotNull(dataRow.deletedAt), lt(dataRow.deletedAt, cutoff)));
  }

  // Borrado explícito en orden: CASCADE sobre tablas enormes bloqueaba lecturas de toda la API.
  private async purgeTable(tableId: string) {
    await this.db.execute(sql`
      DELETE FROM data_cell
      WHERE field_id IN (SELECT id FROM data_field WHERE table_id = ${tableId})
         OR row_id IN (SELECT id FROM data_row WHERE table_id = ${tableId})
    `);
    await this.db.execute(sql`DELETE FROM data_row WHERE table_id = ${tableId}`);
    await this.db.execute(sql`DELETE FROM data_field WHERE table_id = ${tableId}`);
    await this.db.execute(sql`DELETE FROM data_view WHERE table_id = ${tableId}`);
    await this.db
      .delete(memberTableAccess)
      .where(and(eq(memberTableAccess.target, "table"), eq(memberTableAccess.targetId, tableId)));
    await this.db.delete(dataTable).where(eq(dataTable.id, tableId));
  }

  async listBases(actor: Actor) {
    const parentId = this.parentId(actor);
    const grantee = await this.grantee(actor);
    const visible = await this.visibleBaseIds(grantee, parentId);
    const bases = await this.db
      .select({ id: dataBase.id, name: dataBase.name })
      .from(dataBase)
      .where(and(eq(dataBase.parentId, parentId), isNull(dataBase.deletedAt)))
      .orderBy(asc(dataBase.createdAt));
    return bases
      .filter((base) => visible === "all" || visible.has(base.id))
      .map((base) => ({
        ...base,
        canCreateTables: grantee.owner || Boolean(capsForBase(grantee.rules, base.id)?.createTables),
      }));
  }

  async createBase(actor: Actor, name: string) {
    const parentId = this.parentId(actor);
    await this.setsCaps(actor);
    const id = crypto.randomUUID();
    await this.insertUnique({
      id,
      parentId,
      name,
      createdBy: actor.userId,
    }, dataBase);
    return { id, name };
  }

  async deleteBase(actor: Actor, baseId: string) {
    const parentId = this.parentId(actor);
    await this.setsCaps(actor);
    const found = await this.requireBase(parentId, baseId);
    const deletedAt = new Date();
    const activeTables = and(eq(dataTable.baseId, found.id), eq(dataTable.parentId, parentId), isNull(dataTable.deletedAt));
    const tables = await this.db
      .select({ name: dataTable.name })
      .from(dataTable)
      .where(activeTables)
      .orderBy(asc(dataTable.createdAt));
    await this.db.update(dataTable).set({ deletedAt }).where(activeTables);
    await this.db.update(dataBase).set({ deletedAt }).where(eq(dataBase.id, found.id));
    return {
      id: found.id,
      name: found.name,
      tables: tables.map((table) => table.name),
      deletedAt: deletedAt.toISOString(),
      restoreUntil: restoreUntil(deletedAt),
    };
  }

  async restoreBase(actor: Actor, baseId: string) {
    const parentId = this.parentId(actor);
    await this.setsCaps(actor);
    const [found] = await this.db
      .select()
      .from(dataBase)
      .where(and(eq(dataBase.id, baseId), eq(dataBase.parentId, parentId)))
      .limit(1);
    if (!found || !found.deletedAt) {
      throw new NotFoundException(t("tables.notFound"));
    }
    if (!canRestore(found.deletedAt)) {
      throw new ConflictException(t("tables.restoreExpired"));
    }
    const active = await this.db
      .select({ name: dataBase.name })
      .from(dataBase)
      .where(and(eq(dataBase.parentId, parentId), isNull(dataBase.deletedAt)));
    const name = freeName(new Set(active.map((item) => item.name.toLowerCase())), found.name, t("tables.restoredSuffix"));
    await this.db.update(dataBase).set({ deletedAt: null, name }).where(eq(dataBase.id, found.id));
    await this.db
      .update(dataTable)
      .set({ deletedAt: null })
      .where(and(eq(dataTable.baseId, found.id), eq(dataTable.deletedAt, found.deletedAt)));
    return { id: found.id, name };
  }

  async updateBase(actor: Actor, baseId: string, name: string) {
    const parentId = this.parentId(actor);
    await this.setsCaps(actor);
    const found = await this.requireBase(parentId, baseId);
    try {
      await this.db.update(dataBase).set({ name }).where(eq(dataBase.id, found.id));
    } catch (error) {
      throw mapUnique(error);
    }
    return { id: found.id, name };
  }

  async getBase(actor: Actor, baseId: string) {
    const parentId = this.parentId(actor);
    const grantee = await this.grantee(actor);
    const found = await this.requireBase(parentId, baseId);
    const visible = await this.visibleBaseIds(grantee, parentId);
    if (visible !== "all" && !visible.has(found.id)) {
      throw new NotFoundException(t("tables.notFound"));
    }
    const tables = await this.db
      .select({ id: dataTable.id, name: dataTable.name })
      .from(dataTable)
      .where(and(eq(dataTable.baseId, found.id), eq(dataTable.parentId, parentId), isNull(dataTable.deletedAt)))
      .orderBy(asc(dataTable.createdAt));
    return {
      id: found.id,
      name: found.name,
      tables: grantee.owner ? tables : tables.filter((table) => capsForTable(grantee.rules, found.id, table.id) !== null),
    };
  }

  async createTable(actor: Actor, baseId: string, name: string, fields?: FieldInput[]) {
    const parentId = this.parentId(actor);
    await this.requireBase(parentId, baseId);
    await this.baseCaps(actor, baseId, "createTables");
    const source = (fields && fields.length > 0 ? fields : [defaultNameField()]).filter(
      (input): input is FieldInput => Boolean(input && typeof input.name === "string"),
    );
    if (source.length === 0) {
      throw new BadRequestException(t("api.invalidBody"));
    }
    const specs = source.map((input) => {
      const fieldName = input.name.trim();
      if (!fieldName || fieldName.length > 80) {
        throw new BadRequestException(t("api.invalidBody"));
      }
      return { name: fieldName, ...prepareField(input) };
    });
    const seen = new Set<string>();
    for (const spec of specs) {
      const key = spec.name.toLowerCase();
      if (seen.has(key)) {
        throw new ConflictException(t("tables.nameTaken"));
      }
      seen.add(key);
    }
    const tableId = crypto.randomUUID();
    await this.insertUnique(
      { id: tableId, parentId, baseId, name, createdBy: actor.userId },
      dataTable,
    );
    for (const [position, spec] of specs.entries()) {
      await this.insertUnique(
        {
          id: crypto.randomUUID(),
          parentId,
          tableId,
          name: spec.name,
          description: spec.description,
          fieldType: spec.fieldType,
          format: spec.format,
          options: spec.options,
          required: spec.required,
          isUnique: spec.isUnique,
          defaultValue: spec.defaultValue,
          length: spec.length,
          position,
        },
        dataField,
      );
    }
    const viewId = crypto.randomUUID();
    await this.db.insert(dataView).values({
      id: viewId,
      parentId,
      tableId,
      name: t("tables.grid"),
      kind: "grid",
      config: JSON.stringify(emptyViewConfig()),
      shared: true,
      createdBy: actor.userId,
    });
    return { id: tableId, name };
  }

  async deleteTable(actor: Actor, tableId: string) {
    const parentId = this.parentId(actor);
    const found = await this.requireTable(parentId, tableId);
    await this.tableCaps(actor, found, "manage");
    const [base] = await this.db
      .select({ name: dataBase.name })
      .from(dataBase)
      .where(eq(dataBase.id, found.baseId))
      .limit(1);
    const [rowCount] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(dataRow)
      .where(and(eq(dataRow.tableId, found.id), isNull(dataRow.deletedAt)));
    const [fieldCount] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(dataField)
      .where(eq(dataField.tableId, found.id));
    const deletedAt = new Date();
    await this.db.update(dataTable).set({ deletedAt }).where(eq(dataTable.id, found.id));
    return {
      id: found.id,
      name: found.name,
      baseId: found.baseId,
      baseName: base?.name ?? "",
      rows: rowCount?.value ?? 0,
      fields: fieldCount?.value ?? 0,
      deletedAt: deletedAt.toISOString(),
      restoreUntil: restoreUntil(deletedAt),
    };
  }

  async restoreTable(actor: Actor, tableId: string) {
    const parentId = this.parentId(actor);
    const [found] = await this.db
      .select()
      .from(dataTable)
      .where(and(eq(dataTable.id, tableId), eq(dataTable.parentId, parentId)))
      .limit(1);
    if (!found || !found.deletedAt) {
      throw new NotFoundException(t("tables.notFound"));
    }
    await this.tableCaps(actor, found, "manage");
    if (!canRestore(found.deletedAt)) {
      throw new ConflictException(t("tables.restoreExpired"));
    }
    const [base] = await this.db
      .select({ deletedAt: dataBase.deletedAt })
      .from(dataBase)
      .where(eq(dataBase.id, found.baseId))
      .limit(1);
    if (!base || base.deletedAt) {
      throw new ConflictException(t("tables.restoreSetFirst"));
    }
    const active = await this.db
      .select({ name: dataTable.name })
      .from(dataTable)
      .where(and(eq(dataTable.baseId, found.baseId), isNull(dataTable.deletedAt)));
    const name = freeName(new Set(active.map((item) => item.name.toLowerCase())), found.name, t("tables.restoredSuffix"));
    await this.db.update(dataTable).set({ deletedAt: null, name }).where(eq(dataTable.id, found.id));
    return { id: found.id, name, baseId: found.baseId };
  }

  async updateTable(actor: Actor, tableId: string, name: string) {
    const parentId = this.parentId(actor);
    const found = await this.requireTable(parentId, tableId);
    await this.tableCaps(actor, found, "manage");
    try {
      await this.db.update(dataTable).set({ name }).where(eq(dataTable.id, found.id));
    } catch (error) {
      throw mapUnique(error);
    }
    return { id: found.id, name };
  }

  async getTable(actor: Actor, tableId: string, paging?: { limit?: number; offset?: number }) {
    const parentId = this.parentId(actor);
    const found = await this.requireTable(parentId, tableId);
    const caps = await this.tableCaps(actor, found);
    const scope = caps.rowScope;
    const publicCaps = {
      createRows: caps.createRows,
      editRows: caps.editRows,
      deleteRows: caps.deleteRows,
      export: caps.export,
      manage: caps.manage,
    };
    const [fieldCount] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(dataField)
      .where(and(eq(dataField.tableId, found.id), eq(dataField.parentId, parentId)));
    const views = await this.visibleViews(parentId, found.id, actor.userId);
    if ((fieldCount?.value ?? 0) > maxColumns) {
      return {
        table: { id: found.id, name: found.name, baseId: found.baseId },
        fields: [],
        rows: [],
        views,
        people: [] as Array<{ id: string; name: string }>,
        tooLarge: true,
        rowTotal: 0,
        hasMore: false,
        caps: publicCaps,
      };
    }
    const fields = await this.fieldsOf(parentId, found.id);
    const limit = clampPage(paging?.limit, pageDefault, pageMax);
    const offset = Math.max(0, Math.floor(paging?.offset ?? 0));
    const { rows, total } = await this.rowsOf(parentId, found.id, actor, scope, fields, { limit, offset });
    const people = await this.people(parentId);
    return {
      table: { id: found.id, name: found.name, baseId: found.baseId },
      fields: fields.map(publicField),
      rows,
      views,
      people,
      tooLarge: false,
      rowTotal: total,
      hasMore: offset + rows.length < total,
      caps: publicCaps,
    };
  }

  async listTableRows(actor: Actor, tableId: string, paging?: { limit?: number; offset?: number }) {
    const parentId = this.parentId(actor);
    const found = await this.requireTable(parentId, tableId);
    const scope = (await this.tableCaps(actor, found)).rowScope;
    const [fieldCount] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(dataField)
      .where(and(eq(dataField.tableId, found.id), eq(dataField.parentId, parentId)));
    if ((fieldCount?.value ?? 0) > maxColumns) {
      return { rows: [] as RowRecord[], rowTotal: 0, hasMore: false };
    }
    const fields = await this.fieldsOf(parentId, found.id);
    const limit = clampPage(paging?.limit, pageChunk, pageMax);
    const offset = Math.max(0, Math.floor(paging?.offset ?? 0));
    const { rows, total } = await this.rowsOf(parentId, found.id, actor, scope, fields, { limit, offset });
    return {
      rows,
      rowTotal: total,
      hasMore: offset + rows.length < total,
    };
  }

  async createField(actor: Actor, tableId: string, input: FieldInput) {
    const parentId = this.parentId(actor);
    const table = await this.requireTable(parentId, tableId);
    await this.tableCaps(actor, table, "manage");
    const definition = prepareField(input);
    const current = await this.fieldsOf(parentId, tableId);
    const position = current.reduce((max, field) => Math.max(max, field.position), -1) + 1;
    const id = crypto.randomUUID();
    await this.insertUnique(
      {
        id,
        parentId,
        tableId,
        name: input.name,
        ...definition,
        position,
      },
      dataField,
    );
    return { id };
  }

  async updateField(actor: Actor, fieldId: string, input: FieldInput) {
    const parentId = this.parentId(actor);
    const found = await this.requireField(parentId, fieldId);
    await this.tableCaps(actor, await this.requireTable(parentId, found.tableId), "manage");
    const definition = prepareField(input);
    try {
      await this.db
        .update(dataField)
        .set({ name: input.name, ...definition })
        .where(eq(dataField.id, found.id));
    } catch (error) {
      throw mapUnique(error);
    }
    return { id: found.id };
  }

  async deleteField(actor: Actor, fieldId: string) {
    const parentId = this.parentId(actor);
    const found = await this.requireField(parentId, fieldId);
    await this.tableCaps(actor, await this.requireTable(parentId, found.tableId), "manage");
    const fields = await this.fieldsOf(parentId, found.tableId);
    if (fields.length <= 1) {
      throw new BadRequestException(t("tables.lastField"));
    }
    await this.db.delete(dataField).where(eq(dataField.id, found.id));
    return { id: found.id };
  }

  async createRow(actor: Actor, tableId: string, input: { cells: Record<string, string>; assigneeId: string | null }) {
    const parentId = this.parentId(actor);
    const table = await this.requireTable(parentId, tableId);
    const scope = (await this.tableCaps(actor, table, "createRows")).rowScope;
    const fields = await this.fieldsOf(parentId, tableId);
    const assigneeId = await this.resolveAssignee(parentId, input.assigneeId, scope, actor.userId);
    const planned = plannedCells(fields, input.cells, true);
    if (!planned.some((item) => item.value.trim() !== "")) {
      throw new BadRequestException(t("tables.emptyRow"));
    }
    const rowId = crypto.randomUUID();
    await this.ensureUnique(parentId, rowId, planned);
    await this.db.insert(dataRow).values({
      id: rowId,
      parentId,
      tableId,
      createdBy: actor.userId,
      assigneeId,
    });
    await this.storeCells(parentId, rowId, planned);
    return { id: rowId };
  }

  async updateRow(actor: Actor, rowId: string, input: { cells: Record<string, string>; assigneeId: string | null }) {
    const parentId = this.parentId(actor);
    const scope = (await this.rowCaps(actor, parentId, rowId, "editRows")).rowScope;
    const found = await this.requireVisibleRow(parentId, rowId, actor, scope);
    const fields = await this.fieldsOf(parentId, found.tableId);
    const assigneeId = await this.resolveAssignee(parentId, input.assigneeId, scope, actor.userId);
    const planned = plannedCells(fields, input.cells, false);
    await this.ensureUnique(parentId, found.id, planned);
    await this.db
      .update(dataRow)
      .set({ assigneeId, updatedAt: new Date() })
      .where(eq(dataRow.id, found.id));
    await this.storeCells(parentId, found.id, planned);
    return { id: found.id };
  }

  async deleteRow(actor: Actor, rowId: string) {
    const parentId = this.parentId(actor);
    const scope = (await this.rowCaps(actor, parentId, rowId, "deleteRows")).rowScope;
    const found = await this.requireVisibleRow(parentId, rowId, actor, scope);
    const deletedAt = new Date();
    await this.db.update(dataRow).set({ deletedAt }).where(eq(dataRow.id, found.id));
    return { id: found.id, deletedAt: deletedAt.toISOString(), restoreUntil: restoreUntil(deletedAt) };
  }

  async deleteRows(actor: Actor, tableId: string, ids: string[]) {
    const parentId = this.parentId(actor);
    const table = await this.requireTable(parentId, tableId);
    const scope = (await this.tableCaps(actor, table, "deleteRows")).rowScope;
    const candidates = await this.db
      .select()
      .from(dataRow)
      .where(
        and(
          eq(dataRow.tableId, table.id),
          eq(dataRow.parentId, parentId),
          isNull(dataRow.deletedAt),
          inArray(dataRow.id, ids),
        ),
      );
    const visible = candidates.filter((row) => rowInScope(row, actor, scope)).map((row) => row.id);
    if (visible.length === 0) {
      throw new NotFoundException(t("tables.notFound"));
    }
    const deletedAt = new Date();
    await this.db.update(dataRow).set({ deletedAt }).where(inArray(dataRow.id, visible));
    return { ids: visible, deletedAt: deletedAt.toISOString(), restoreUntil: restoreUntil(deletedAt) };
  }

  async restoreRows(actor: Actor, tableId: string, ids: string[]) {
    const parentId = this.parentId(actor);
    const table = await this.requireTable(parentId, tableId);
    const scope = (await this.tableCaps(actor, table, "deleteRows")).rowScope;
    const candidates = await this.db
      .select()
      .from(dataRow)
      .where(
        and(
          eq(dataRow.tableId, table.id),
          eq(dataRow.parentId, parentId),
          isNotNull(dataRow.deletedAt),
          inArray(dataRow.id, ids),
        ),
      );
    const visible = candidates.filter((row) => rowInScope(row, actor, scope));
    if (visible.length === 0) {
      throw new NotFoundException(t("tables.notFound"));
    }
    const restorable = visible.filter((row) => canRestore(row.deletedAt)).map((row) => row.id);
    if (restorable.length === 0) {
      throw new ConflictException(t("tables.restoreExpired"));
    }
    const uniqueFields = (await this.fieldsOf(parentId, table.id)).filter((field) => field.isUnique);
    if (uniqueFields.length > 0) {
      const incoming = await this.db
        .select({ fieldId: dataCell.fieldId, value: dataCell.value })
        .from(dataCell)
        .where(
          and(
            inArray(dataCell.rowId, restorable),
            inArray(
              dataCell.fieldId,
              uniqueFields.map((field) => field.id),
            ),
          ),
        );
      for (const cell of incoming.filter((item) => item.value !== "")) {
        const [clash] = await this.db
          .select({ id: dataCell.id })
          .from(dataCell)
          .innerJoin(dataRow, eq(dataRow.id, dataCell.rowId))
          .where(
            and(
              eq(dataCell.fieldId, cell.fieldId),
              eq(dataCell.value, cell.value),
              isNull(dataRow.deletedAt),
            ),
          )
          .limit(1);
        if (clash) {
          throw new ConflictException(t("tables.duplicateValue"));
        }
      }
    }
    await this.db
      .update(dataRow)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(inArray(dataRow.id, restorable));
    return { restored: restorable.length, expired: visible.length - restorable.length };
  }

  async createView(actor: Actor, tableId: string, input: { name: string; kind: ViewKind; shared: boolean }) {
    const parentId = this.parentId(actor);
    const table = await this.requireTable(parentId, tableId);
    await this.tableCaps(actor, table, input.shared ? "manage" : undefined);
    const fields = await this.fieldsOf(parentId, tableId);
    const config = emptyViewConfig();
    if (input.kind === "kanban") {
      config.kanbanFieldId = fields.find((field) => field.fieldType === "select")?.id ?? null;
    }
    if (input.kind === "calendar") {
      config.calendarFieldId = fields.find((field) => field.fieldType === "date")?.id ?? null;
    }
    const id = crypto.randomUUID();
    await this.insertUnique(
      {
        id,
        parentId,
        tableId,
        name: input.name,
        kind: input.kind,
        config: JSON.stringify(config),
        shared: input.shared,
        createdBy: actor.userId,
      },
      dataView,
    );
    return { id };
  }

  async updateView(
    actor: Actor,
    viewId: string,
    input: { name?: string; kind?: ViewKind; config?: ViewConfig; shared?: boolean },
  ) {
    const parentId = this.parentId(actor);
    const found = await this.requireVisibleView(parentId, viewId, actor.userId);
    const table = await this.requireTable(parentId, found.tableId);
    const personal = !found.shared && found.createdBy === actor.userId;
    const sharing = input.shared !== undefined && input.shared !== found.shared;
    await this.tableCaps(actor, table, personal && !sharing ? undefined : "manage");
    try {
      await this.db
        .update(dataView)
        .set({
          name: input.name ?? found.name,
          kind: input.kind ?? found.kind,
          config: JSON.stringify(input.config ?? readStoredConfig(found.config)),
          shared: input.shared ?? found.shared,
        })
        .where(eq(dataView.id, found.id));
    } catch (error) {
      throw mapUnique(error);
    }
    return { id: found.id };
  }

  async deleteView(actor: Actor, viewId: string) {
    const parentId = this.parentId(actor);
    const found = await this.requireVisibleView(parentId, viewId, actor.userId);
    await this.tableCaps(
      actor,
      await this.requireTable(parentId, found.tableId),
      found.shared || found.createdBy !== actor.userId ? "manage" : undefined,
    );
    const views = await this.db
      .select({ id: dataView.id })
      .from(dataView)
      .where(and(eq(dataView.tableId, found.tableId), eq(dataView.parentId, parentId)));
    if (views.length <= 1) {
      throw new BadRequestException(t("tables.lastView"));
    }
    await this.db.delete(dataView).where(eq(dataView.id, found.id));
    return { id: found.id };
  }

  async exportTable(actor: Actor, tableId: string, format: "csv" | "xlsx") {
    const parentId = this.parentId(actor);
    const found = await this.requireTable(parentId, tableId);
    const scope = (await this.tableCaps(actor, found, "export")).rowScope;
    const fields = await this.fieldsOf(parentId, found.id);
    const { rows } = await this.rowsOf(parentId, found.id, actor, scope, fields);
    const headers = fields.map((field) => field.name);
    const lines = rows.map((row) => fields.map((field) => row.cells[field.id] ?? ""));
    const filename = `${safeFileName(found.name)}.${format}`;
    if (format === "csv") {
      const csv = [headers, ...lines].map((line) => line.map(escapeCsv).join(",")).join("\n");
      return {
        filename,
        mime: "text/csv",
        contentBase64: Buffer.from(csv, "utf8").toString("base64"),
      };
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tabla");
    sheet.addRow(headers);
    for (const line of lines) {
      sheet.addRow(line);
    }
    const raw = await workbook.xlsx.writeBuffer();
    return {
      filename,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentBase64: Buffer.from(raw).toString("base64"),
    };
  }

  async importIntoBase(
    actor: Actor,
    baseId: string,
    format: "csv" | "xlsx",
    contentBase64: string,
    name?: string,
  ) {
    const { header, body } = normalizeImportMatrix(await readImportMatrix(format, contentBase64));
    if (!header.length || header.every((label) => label.trim() === "")) {
      throw new BadRequestException(t("tables.importInvalidFile"));
    }
    if (body.length === 0) {
      throw new BadRequestException(t("tables.importNoRows"));
    }
    if (body.length > maxRows) {
      throw new BadRequestException(t("tables.importTooManyRows"));
    }
    if (header.length > maxColumns) {
      throw new BadRequestException(t("tables.importTooManyColumns"));
    }
    const fields: FieldInput[] = namesFromHeader(header).map((fieldName) => ({
      name: fieldName,
      description: "",
      fieldType: "text",
      format: "plain",
      options: [],
      required: false,
      unique: false,
      defaultValue: "",
    }));
    const tableName = await this.uniqueTableName(
      this.parentId(actor),
      baseId,
      (name?.trim() || t("tables.importedTable")).slice(0, 80),
    );
    const created = await this.createTable(actor, baseId, tableName, fields);
    try {
      const imported = await this.importMatrix(actor, created.id, header, body, true);
      return { id: created.id, name: created.name, imported: imported.imported };
    } catch (error) {
      await this.purgeTable(created.id);
      throw error;
    }
  }

  async importTable(actor: Actor, tableId: string, format: "csv" | "xlsx", contentBase64: string) {
    const { header, body } = normalizeImportMatrix(await readImportMatrix(format, contentBase64));
    return this.importMatrix(actor, tableId, header, body);
  }

  private async importMatrix(actor: Actor, tableId: string, header: string[], body: string[][], created = false) {
    const parentId = this.parentId(actor);
    const found = await this.requireTable(parentId, tableId);
    // Quien acaba de crear la tabla al importar puede cargar sus filas aunque no tenga "agregar filas".
    const rowScope = created
      ? (await this.baseCaps(actor, found.baseId, "createTables")).rowScope
      : (await this.tableCaps(actor, found, "createRows")).rowScope;
    const fields = await this.fieldsOf(parentId, found.id);
    if (!header.length || body.length === 0) {
      throw new BadRequestException(t("tables.importNoRows"));
    }
    if (body.length > maxRows) {
      throw new BadRequestException(t("tables.importTooManyRows"));
    }
    if (header.length > maxColumns) {
      throw new BadRequestException(t("tables.importTooManyColumns"));
    }
    const expectedNames = namesFromHeader(header);
    const columns = expectedNames.map((fieldName, index) => {
      const byName =
        fields.find((field) => field.name.trim().toLowerCase() === fieldName.toLowerCase()) ??
        (header[index]?.trim()
          ? fields.find((field) => field.name.trim().toLowerCase() === header[index].trim().toLowerCase())
          : null);
      return byName ?? null;
    });
    if (!columns.some(Boolean)) {
      throw new BadRequestException(t("tables.importNoMatch"));
    }
    const assigneeId = rowScope === "assigned" ? actor.userId : null;
    const rowValues: Array<{
      id: string;
      parentId: string;
      tableId: string;
      createdBy: string;
      assigneeId: string | null;
    }> = [];
    const cellValues: Array<{ id: string; parentId: string; rowId: string; fieldId: string; value: string }> = [];
    for (const line of body) {
      const blank = columns.every((field, index) => !field || (line[index] ?? "").trim() === "");
      if (blank) {
        continue;
      }
      const cells: Record<string, string> = {};
      columns.forEach((field, index) => {
        if (field) {
          cells[field.id] = line[index] ?? "";
        }
      });
      const planned = plannedCells(fields, cells, true);
      const rowId = crypto.randomUUID();
      rowValues.push({
        id: rowId,
        parentId,
        tableId: found.id,
        createdBy: actor.userId,
        assigneeId,
      });
      for (const item of planned) {
        if (item.value !== "") {
          cellValues.push({
            id: crypto.randomUUID(),
            parentId,
            rowId,
            fieldId: item.field.id,
            value: item.value,
          });
        }
      }
    }
    if (rowValues.length === 0) {
      throw new BadRequestException(t("tables.emptyRow"));
    }
    for (let index = 0; index < rowValues.length; index += importChunk) {
      await this.db.insert(dataRow).values(rowValues.slice(index, index + importChunk));
    }
    for (let index = 0; index < cellValues.length; index += importChunk) {
      await this.db.insert(dataCell).values(cellValues.slice(index, index + importChunk));
    }
    return { imported: rowValues.length };
  }

  private async uniqueTableName(parentId: string, baseId: string, baseName: string) {
    const existing = await this.db
      .select({ name: dataTable.name })
      .from(dataTable)
      .where(and(eq(dataTable.parentId, parentId), eq(dataTable.baseId, baseId), isNull(dataTable.deletedAt)));
    const taken = new Set(existing.map((item) => item.name.toLowerCase()));
    if (!taken.has(baseName.toLowerCase())) {
      return baseName;
    }
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const next = `${baseName.slice(0, 70)} ${suffix}`;
      if (!taken.has(next.toLowerCase())) {
        return next;
      }
    }
    throw new ConflictException(t("tables.nameTaken"));
  }

  private parentId(actor: Actor) {
    if (!actor.parentId) {
      throw new ForbiddenException(t("api.forbidden"));
    }
    return actor.parentId;
  }

  private async grantee(actor: Actor): Promise<Grantee> {
    if (actor.kind === "parent") {
      return { owner: true, rules: [] };
    }
    const grants = await grantsForUser(this.db, actor.userId);
    if (!grants.some((grant) => grant.module === "tables")) {
      throw new ForbiddenException(t("api.forbidden"));
    }
    return { owner: false, rules: await accessForUser(this.db, actor.userId) };
  }

  private allow(grantee: Grantee, caps: TableCaps | null, need?: CapFlag): TableCaps {
    const resolved = grantee.owner ? fullCaps : caps;
    if (!resolved || (need && !resolved[need])) {
      throw new ForbiddenException(t("api.forbidden"));
    }
    return resolved;
  }

  private async tableCaps(actor: Actor, table: { id: string; baseId: string }, need?: CapFlag) {
    const grantee = await this.grantee(actor);
    return this.allow(grantee, capsForTable(grantee.rules, table.baseId, table.id), need);
  }

  private async baseCaps(actor: Actor, baseId: string, need?: CapFlag) {
    const grantee = await this.grantee(actor);
    return this.allow(grantee, capsForBase(grantee.rules, baseId), need);
  }

  private async setsCaps(actor: Actor) {
    const grantee = await this.grantee(actor);
    return this.allow(grantee, ruleFor(grantee.rules, "all"), "manageSets");
  }

  private async rowCaps(actor: Actor, parentId: string, rowId: string, need: CapFlag) {
    const [row] = await this.db
      .select({ tableId: dataRow.tableId })
      .from(dataRow)
      .where(and(eq(dataRow.id, rowId), eq(dataRow.parentId, parentId)))
      .limit(1);
    if (!row) {
      throw new NotFoundException(t("tables.notFound"));
    }
    return this.tableCaps(actor, await this.requireTable(parentId, row.tableId), need);
  }

  // Un hijo ve un conjunto si tiene acceso a todo, al conjunto o a alguna de sus tablas.
  private async visibleBaseIds(grantee: Grantee, parentId: string): Promise<Set<string> | "all"> {
    if (grantee.owner || ruleFor(grantee.rules, "all")) {
      return "all";
    }
    const ids = new Set(grantee.rules.filter((rule) => rule.target === "base").map((rule) => rule.targetId));
    const tableIds = grantee.rules.filter((rule) => rule.target === "table").map((rule) => rule.targetId);
    if (tableIds.length > 0) {
      const tables = await this.db
        .select({ baseId: dataTable.baseId })
        .from(dataTable)
        .where(and(eq(dataTable.parentId, parentId), inArray(dataTable.id, tableIds), isNull(dataTable.deletedAt)));
      for (const table of tables) {
        ids.add(table.baseId);
      }
    }
    return ids;
  }

  private async requireBase(parentId: string, baseId: string) {
    const [found] = await this.db
      .select()
      .from(dataBase)
      .where(and(eq(dataBase.id, baseId), eq(dataBase.parentId, parentId), isNull(dataBase.deletedAt)))
      .limit(1);
    if (!found) {
      throw new NotFoundException(t("tables.notFound"));
    }
    return found;
  }

  private async requireTable(parentId: string, tableId: string) {
    const [found] = await this.db
      .select()
      .from(dataTable)
      .where(and(eq(dataTable.id, tableId), eq(dataTable.parentId, parentId), isNull(dataTable.deletedAt)))
      .limit(1);
    if (!found) {
      throw new NotFoundException(t("tables.notFound"));
    }
    return found;
  }

  private async requireField(parentId: string, fieldId: string) {
    const [found] = await this.db
      .select()
      .from(dataField)
      .where(and(eq(dataField.id, fieldId), eq(dataField.parentId, parentId)))
      .limit(1);
    if (!found) {
      throw new NotFoundException(t("tables.notFound"));
    }
    return found;
  }

  private async fieldsOf(parentId: string, tableId: string): Promise<FieldRow[]> {
    const rows = await this.db
      .select()
      .from(dataField)
      .where(and(eq(dataField.tableId, tableId), eq(dataField.parentId, parentId)))
      .orderBy(asc(dataField.position));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      fieldType: row.fieldType,
      format: row.format,
      options: row.options,
      required: row.required,
      isUnique: row.isUnique,
      defaultValue: row.defaultValue,
      length: row.length,
      position: row.position,
    }));
  }

  private async rowsOf(
    parentId: string,
    tableId: string,
    actor: Actor,
    scope: PermissionScope,
    fields: FieldRow[],
    paging?: { limit?: number; offset?: number },
  ): Promise<{ rows: RowRecord[]; total: number }> {
    const filters = [eq(dataRow.tableId, tableId), eq(dataRow.parentId, parentId), isNull(dataRow.deletedAt)];
    if (scope === "own") {
      filters.push(eq(dataRow.createdBy, actor.userId));
    }
    if (scope === "assigned") {
      filters.push(eq(dataRow.assigneeId, actor.userId));
    }
    const where = and(...filters);
    const [countRow] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(dataRow)
      .where(where);
    const total = countRow?.value ?? 0;
    if (total === 0) {
      return { rows: [], total: 0 };
    }
    const limit = paging?.limit;
    const offset = paging?.offset ?? 0;
    const rows =
      limit == null
        ? await this.db.select().from(dataRow).where(where).orderBy(asc(dataRow.createdAt))
        : await this.db
            .select()
            .from(dataRow)
            .where(where)
            .orderBy(asc(dataRow.createdAt))
            .limit(limit)
            .offset(offset);
    if (rows.length === 0) {
      return { rows: [], total };
    }
    const cells = await this.db
      .select()
      .from(dataCell)
      .where(
        and(
          eq(dataCell.parentId, parentId),
          inArray(
            dataCell.rowId,
            rows.map((row) => row.id),
          ),
        ),
      );
    const valuesByRow = new Map<string, Record<string, string>>();
    for (const row of rows) {
      const values: Record<string, string> = {};
      for (const field of fields) {
        values[field.id] = "";
      }
      valuesByRow.set(row.id, values);
    }
    for (const cell of cells) {
      const values = valuesByRow.get(cell.rowId);
      if (values && cell.fieldId in values) {
        values[cell.fieldId] = cell.value ?? "";
      }
    }
    return {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        createdBy: row.createdBy,
        assigneeId: row.assigneeId,
        cells: valuesByRow.get(row.id) ?? {},
      })),
    };
  }

  private async visibleViews(parentId: string, tableId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(dataView)
      .where(and(eq(dataView.tableId, tableId), eq(dataView.parentId, parentId)))
      .orderBy(asc(dataView.createdAt));
    return rows
      .filter((row) => row.shared || row.createdBy === userId)
      .map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        shared: row.shared,
        createdBy: row.createdBy,
        config: readStoredConfig(row.config),
      }));
  }

  private async requireVisibleView(parentId: string, viewId: string, userId: string) {
    const [found] = await this.db
      .select()
      .from(dataView)
      .where(and(eq(dataView.id, viewId), eq(dataView.parentId, parentId)))
      .limit(1);
    if (!found || (!found.shared && found.createdBy !== userId)) {
      throw new NotFoundException(t("tables.notFound"));
    }
    return found;
  }

  private async requireVisibleRow(parentId: string, rowId: string, actor: Actor, scope: PermissionScope) {
    const [found] = await this.db
      .select()
      .from(dataRow)
      .where(and(eq(dataRow.id, rowId), eq(dataRow.parentId, parentId), isNull(dataRow.deletedAt)))
      .limit(1);
    if (!found || !rowInScope(found, actor, scope)) {
      throw new NotFoundException(t("tables.notFound"));
    }
    return found;
  }

  private async people(parentId: string) {
    const rows = await this.db
      .select({ id: user.id, name: user.name, kind: user.kind })
      .from(user)
      .where(eq(user.parentId, parentId));
    const [parent] = await this.db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(eq(user.id, parentId), eq(user.kind, "parent")))
      .limit(1);
    const children = rows
      .filter((row) => row.kind === "child")
      .map((row) => ({ id: row.id, name: row.name }));
    return parent ? [{ id: parent.id, name: parent.name }, ...children] : children;
  }

  private async resolveAssignee(
    parentId: string,
    assigneeId: string | null,
    scope: PermissionScope,
    actorId: string,
  ) {
    const chosen = scope === "assigned" && !assigneeId ? actorId : assigneeId;
    if (!chosen) {
      return null;
    }
    const people = await this.people(parentId);
    if (!people.some((person) => person.id === chosen)) {
      throw new BadRequestException(t("api.invalidBody"));
    }
    return chosen;
  }

  private async ensureUnique(parentId: string, rowId: string, planned: PlannedCell[]) {
    for (const item of planned) {
      if (item.field.isUnique && item.value !== "") {
        await this.assertUnique(parentId, item.field.id, item.value, rowId);
      }
    }
  }

  private async storeCells(parentId: string, rowId: string, planned: PlannedCell[]) {
    for (const item of planned) {
      const [existing] = await this.db
        .select({ id: dataCell.id })
        .from(dataCell)
        .where(and(eq(dataCell.rowId, rowId), eq(dataCell.fieldId, item.field.id)))
        .limit(1);
      if (existing) {
        await this.db.update(dataCell).set({ value: item.value }).where(eq(dataCell.id, existing.id));
      } else if (item.value !== "") {
        await this.db.insert(dataCell).values({
          id: crypto.randomUUID(),
          parentId,
          rowId,
          fieldId: item.field.id,
          value: item.value,
        });
      }
    }
  }

  private async assertUnique(parentId: string, fieldId: string, value: string, rowId: string) {
    const matches = await this.db
      .select({ rowId: dataCell.rowId })
      .from(dataCell)
      .innerJoin(dataRow, eq(dataRow.id, dataCell.rowId))
      .where(
        and(
          eq(dataCell.parentId, parentId),
          eq(dataCell.fieldId, fieldId),
          eq(dataCell.value, value),
          isNull(dataRow.deletedAt),
        ),
      );
    if (matches.some((match) => match.rowId !== rowId)) {
      throw new ConflictException(t("tables.duplicateValue"));
    }
  }

  private async insertUnique(
    values: Record<string, unknown>,
    table: typeof dataBase | typeof dataTable | typeof dataField | typeof dataView,
  ) {
    try {
      await this.db.insert(table).values(values as never);
    } catch (error) {
      throw mapUnique(error);
    }
  }
}

function publicField(field: FieldRow) {
  return {
    id: field.id,
    name: field.name,
    description: field.description,
    fieldType: field.fieldType,
    format: coerceFormat(field.fieldType, field.format),
    options: readOptions(field.options),
    required: field.required,
    unique: field.isUnique,
    defaultValue: field.defaultValue,
    length: field.length,
    position: field.position,
  };
}

function defaultNameField(): FieldInput {
  return {
    name: t("tables.nameField"),
    description: "",
    fieldType: "text",
    format: "plain",
    options: [],
    required: false,
    unique: false,
    defaultValue: "",
  };
}

function prepareField(input: FieldInput) {
  const description = input.description.trim();
  if (description.length > 240) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  const format = coerceFormat(input.fieldType, input.format);
  const options = input.fieldType === "select" ? cleanOptions(input.options) : [];
  if (input.fieldType === "select" && options.length === 0) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  const length = input.fieldType === "uuid" && format === "code" ? clampIdLength(input.length) : null;
  let defaultValue = "";
  try {
    defaultValue = normalizeStoredValue(
      { fieldType: input.fieldType, format, options, required: false, length },
      input.defaultValue,
    );
  } catch {
    throw new BadRequestException(t("tables.invalidValue"));
  }
  return {
    description,
    fieldType: input.fieldType,
    format,
    options: JSON.stringify(options),
    required: input.required,
    isUnique: input.unique,
    defaultValue,
    length,
  };
}

function plannedCells(fields: FieldRow[], cells: Record<string, string>, creating: boolean): PlannedCell[] {
  const planned: PlannedCell[] = [];
  for (const field of fields) {
    const present = field.id in cells;
    if (!present && !creating) {
      continue;
    }
    let raw = present ? (cells[field.id] ?? "") : "";
    if (creating && raw.trim() === "" && field.defaultValue !== "") {
      raw = field.defaultValue;
    }
    planned.push({ field, value: readStored(field, raw) });
  }
  return planned;
}

function readStored(field: FieldRow, raw: string) {
  try {
    return normalizeStoredValue(
      {
        fieldType: field.fieldType,
        format: field.format,
        options: readOptions(field.options),
        required: field.required,
        length: field.length,
      },
      raw,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "tables.requiredValue") {
      throw new BadRequestException(t("tables.requiredValue"));
    }
    throw new BadRequestException(t("tables.invalidValue"));
  }
}

function readOptions(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function cleanOptions(options: string[]) {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))];
}

function readStoredConfig(value: string) {
  try {
    return readViewConfig(JSON.parse(value) as unknown);
  } catch {
    return emptyViewConfig();
  }
}

function rowInScope(
  row: { createdBy: string | null; assigneeId: string | null },
  actor: Actor,
  scope: PermissionScope,
) {
  if (scope === "all") {
    return true;
  }
  if (scope === "own") {
    return row.createdBy === actor.userId;
  }
  return row.assigneeId === actor.userId;
}

function mapUnique(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
  if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
    return new ConflictException(t("tables.nameTaken"));
  }
  return error instanceof Error ? error : new Error(t("api.invalidBody"));
}

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "tabla";
}

async function readImportMatrix(format: "csv" | "xlsx", contentBase64: string) {
  const buffer = decodeBase64(contentBase64);
  if (isOleCompound(buffer)) {
    throw new BadRequestException(t("tables.importNeedsXlsx"));
  }
  const looksZip = isZipBuffer(buffer);
  const looksText = isTextSpreadsheet(buffer);
  if (format === "xlsx" || looksZip) {
    try {
      return await readXlsx(buffer);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (looksText || format === "csv") {
        return parseCsv(buffer.toString("utf8"));
      }
      throw new BadRequestException(t("tables.importInvalidFile"));
    }
  }
  return parseCsv(buffer.toString("utf8"));
}

function decodeBase64(value: string) {
  if (!value || !/^[A-Za-z0-9+/=\s]+$/.test(value)) {
    throw new BadRequestException(t("tables.importInvalidFile"));
  }
  return Buffer.from(value.replace(/\s/g, ""), "base64");
}

function isZipBuffer(buffer: Buffer) {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isOleCompound(buffer: Buffer) {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

function isTextSpreadsheet(buffer: Buffer) {
  const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString("utf8").trimStart();
  return (
    head.startsWith("<?xml") ||
    head.startsWith("<html") ||
    head.startsWith("<!DOCTYPE") ||
    head.startsWith("<table") ||
    /^sep=/i.test(head) ||
    (!isZipBuffer(buffer) && !isOleCompound(buffer) && /[,\t;]/.test(head))
  );
}

function detectCsvDelimiter(firstLine: string): string {
  const marker = firstLine.match(/^sep=(.)\s*$/i);
  if (marker?.[1]) {
    return marker[1];
  }
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) {
      continue;
    }
    if (char === ",") {
      commas += 1;
    } else if (char === ";") {
      semis += 1;
    } else if (char === "\t") {
      tabs += 1;
    }
  }
  if (tabs >= commas && tabs >= semis && tabs > 0) {
    return "\t";
  }
  if (semis > commas) {
    return ";";
  }
  return ",";
}

function firstCsvLine(source: string) {
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      return source.slice(0, index);
    }
  }
  return source;
}

function parseCsv(text: string) {
  let source = text.replace(/^\uFEFF/, "");
  const probe = firstCsvLine(source).trim();
  let delimiter = detectCsvDelimiter(probe);
  if (/^sep=./i.test(probe)) {
    const end = firstCsvLine(source).length;
    let next = end;
    if (source[next] === "\r") {
      next += 1;
    }
    if (source[next] === "\n") {
      next += 1;
    }
    source = source.slice(next);
    delimiter = detectCsvDelimiter(probe);
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((item) => item.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((item) => item.trim() !== "")) {
      rows.push(row);
    }
  }
  return rows;
}

const xlsxIgnoreNodes = [
  "drawing",
  "legacyDrawing",
  "vmlDrawing",
  "printerSettings",
  "extLst",
  "headerFooter",
  "pageMargins",
  "pageSetup",
  "picture",
];

async function readXlsx(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  const payload = Buffer.from(buffer);
  try {
    await workbook.xlsx.load(payload, { ignoreNodes: xlsxIgnoreNodes });
  } catch {
    await workbook.xlsx.load(payload);
  }
  const sheet = pickDataSheet(workbook);
  if (!sheet) {
    throw new BadRequestException(t("tables.importEmptySheet"));
  }
  const maxCol = sheetColumnCount(sheet);
  if (maxCol > maxColumns) {
    throw new BadRequestException(t("tables.importTooManyColumns"));
  }
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const dense = rowToValues(row, maxCol);
    if (dense.some((cell) => cell.trim() !== "")) {
      rows.push(dense);
    }
  });
  if (rows.length === 0) {
    throw new BadRequestException(t("tables.importEmptySheet"));
  }
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => densifyRow(row, width));
}

function pickDataSheet(workbook: ExcelJS.Workbook) {
  let best: ExcelJS.Worksheet | null = null;
  let bestScore = -1;
  for (const sheet of workbook.worksheets) {
    if (!sheet || sheet.state === "hidden" || sheet.state === "veryHidden") {
      continue;
    }
    let score = 0;
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values : [];
      if (values.some((value, index) => index > 0 && cellText(value).trim() !== "")) {
        score += 1;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      best = sheet;
    }
  }
  return best ?? workbook.worksheets[0] ?? null;
}

function sheetColumnCount(sheet: ExcelJS.Worksheet) {
  let maxCol = 0;
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cellText(cell.value).trim() !== "") {
        maxCol = Math.max(maxCol, colNumber);
      }
    });
  });
  return Math.max(maxCol, 1);
}

function rowToValues(row: ExcelJS.Row, maxCol: number) {
  const dense: string[] = [];
  for (let col = 1; col <= maxCol; col += 1) {
    dense.push(cellText(row.getCell(col).value));
  }
  return dense;
}

function normalizeImportMatrix(matrix: string[][]) {
  if (matrix.length === 0) {
    return { header: [] as string[], body: [] as string[][] };
  }
  let width = 0;
  for (const row of matrix) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if ((row[index] ?? "").trim() !== "") {
        width = Math.max(width, index + 1);
        break;
      }
    }
  }
  if (width === 0) {
    return { header: [] as string[], body: [] as string[][] };
  }
  if (width > maxColumns) {
    throw new BadRequestException(t("tables.importTooManyColumns"));
  }
  const header = densifyRow(matrix[0], width).slice(0, width);
  const body = matrix
    .slice(1)
    .map((row) => densifyRow(row, width).slice(0, width))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
  return { header, body };
}

function namesFromHeader(header: string[]) {
  const used = new Set<string>();
  return header.map((label, index) => {
    const raw = label.trim().slice(0, 80) || `${t("tables.field")} ${index + 1}`;
    let fieldName = raw;
    let suffix = 2;
    while (used.has(fieldName.toLowerCase())) {
      fieldName = `${raw.slice(0, 70)} ${suffix}`;
      suffix += 1;
    }
    used.add(fieldName.toLowerCase());
    return fieldName;
  });
}

function densifyRow(row: string[] | undefined, width = 0) {
  const source = row ?? [];
  const length = Math.max(source.length, width);
  const dense: string[] = [];
  for (let index = 0; index < length; index += 1) {
    dense.push(typeof source[index] === "string" ? source[index] : cellText(source[index]));
  }
  return dense;
}

function cellText(value: unknown): string {
  try {
    if (value == null) {
      return "";
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
    }
    if (typeof value === "object") {
      if ("richText" in value && Array.isArray((value as { richText: unknown }).richText)) {
        return (value as { richText: Array<{ text?: string }> }).richText.map((part) => part.text ?? "").join("");
      }
      if ("text" in value && typeof (value as { text: unknown }).text === "string") {
        return (value as { text: string }).text;
      }
      if ("result" in value) {
        return cellText((value as { result: unknown }).result);
      }
      if ("formula" in value && "result" in value) {
        return cellText((value as { result: unknown }).result);
      }
      if ("sharedFormula" in value && "result" in value) {
        return cellText((value as { result: unknown }).result);
      }
      if ("error" in value) {
        return "";
      }
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "";
  } catch {
    return "";
  }
}
