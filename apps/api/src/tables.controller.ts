import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { isFieldType, isViewKind, readViewConfig, t, type FieldType, type ViewKind } from "@wanted/shared";
import { WorkspaceGuard, type ActorRequest } from "./guards.ts";
import { TablesService } from "./tables.service.ts";

@Controller("api")
@UseGuards(WorkspaceGuard)
export class TablesController {
  constructor(@Inject(TablesService) private readonly tables: TablesService) {}

  @Get("workspace/bases")
  listBases(@Req() request: ActorRequest) {
    return this.tables.listBases(request.actor!);
  }

  @Post("workspace/bases")
  createBase(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.tables.createBase(request.actor!, readName(body));
  }

  @Get("workspace/bases/:baseId")
  getBase(@Req() request: ActorRequest, @Param("baseId") baseId: string) {
    return this.tables.getBase(request.actor!, baseId);
  }

  @Delete("workspace/bases/:baseId")
  deleteBase(@Req() request: ActorRequest, @Param("baseId") baseId: string) {
    return this.tables.deleteBase(request.actor!, baseId);
  }

  @Post("workspace/bases/:baseId")
  updateBase(@Req() request: ActorRequest, @Param("baseId") baseId: string, @Body() body: unknown) {
    return this.tables.updateBase(request.actor!, baseId, readName(body));
  }

  @Post("workspace/bases/:baseId/restore")
  restoreBase(@Req() request: ActorRequest, @Param("baseId") baseId: string) {
    return this.tables.restoreBase(request.actor!, baseId);
  }

  @Post("workspace/bases/:baseId/tables")
  createTable(@Req() request: ActorRequest, @Param("baseId") baseId: string, @Body() body: unknown) {
    return this.tables.createTable(request.actor!, baseId, readName(body), readOptionalFields(body));
  }

  @Post("workspace/bases/:baseId/import")
  importBase(@Req() request: ActorRequest, @Param("baseId") baseId: string, @Body() body: unknown) {
    const input = readImport(body);
    return this.tables.importIntoBase(
      request.actor!,
      baseId,
      input.format,
      input.contentBase64,
      input.name,
    );
  }

  @Delete("workspace/data-tables/:tableId")
  deleteTable(@Req() request: ActorRequest, @Param("tableId") tableId: string) {
    return this.tables.deleteTable(request.actor!, tableId);
  }

  @Post("workspace/data-tables/:tableId/restore")
  restoreTable(@Req() request: ActorRequest, @Param("tableId") tableId: string) {
    return this.tables.restoreTable(request.actor!, tableId);
  }

  @Post("workspace/data-tables/:tableId/rows/delete")
  deleteRows(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    return this.tables.deleteRows(request.actor!, tableId, readIds(body));
  }

  @Post("workspace/data-tables/:tableId/rows/restore")
  restoreRows(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    return this.tables.restoreRows(request.actor!, tableId, readIds(body));
  }

  @Post("workspace/data-tables/:tableId")
  updateTable(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    return this.tables.updateTable(request.actor!, tableId, readName(body));
  }

  @Get("workspace/data-tables/:tableId")
  getTable(
    @Req() request: ActorRequest,
    @Param("tableId") tableId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.tables.getTable(request.actor!, tableId, {
      limit: readPageInt(limit),
      offset: readPageInt(offset),
    });
  }

  @Get("workspace/data-tables/:tableId/rows")
  listTableRows(
    @Req() request: ActorRequest,
    @Param("tableId") tableId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.tables.listTableRows(request.actor!, tableId, {
      limit: readPageInt(limit),
      offset: readPageInt(offset),
    });
  }

  @Post("workspace/data-tables/:tableId/fields")
  createField(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    return this.tables.createField(request.actor!, tableId, readField(body));
  }

  @Post("workspace/data-fields/:fieldId")
  updateField(@Req() request: ActorRequest, @Param("fieldId") fieldId: string, @Body() body: unknown) {
    return this.tables.updateField(request.actor!, fieldId, readField(body));
  }

  @Delete("workspace/data-fields/:fieldId")
  deleteField(@Req() request: ActorRequest, @Param("fieldId") fieldId: string) {
    return this.tables.deleteField(request.actor!, fieldId);
  }

  @Post("workspace/data-tables/:tableId/rows")
  createRow(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    return this.tables.createRow(request.actor!, tableId, readRow(body));
  }

  @Post("workspace/data-rows/:rowId")
  updateRow(@Req() request: ActorRequest, @Param("rowId") rowId: string, @Body() body: unknown) {
    return this.tables.updateRow(request.actor!, rowId, readRow(body));
  }

  @Delete("workspace/data-rows/:rowId")
  deleteRow(@Req() request: ActorRequest, @Param("rowId") rowId: string) {
    return this.tables.deleteRow(request.actor!, rowId);
  }

  @Post("workspace/data-tables/:tableId/views")
  createView(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    return this.tables.createView(request.actor!, tableId, readNewView(body));
  }

  @Post("workspace/data-views/:viewId")
  updateView(@Req() request: ActorRequest, @Param("viewId") viewId: string, @Body() body: unknown) {
    return this.tables.updateView(request.actor!, viewId, readViewPatch(body));
  }

  @Delete("workspace/data-views/:viewId")
  deleteView(@Req() request: ActorRequest, @Param("viewId") viewId: string) {
    return this.tables.deleteView(request.actor!, viewId);
  }

  @Post("workspace/data-tables/:tableId/export")
  exportTable(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    return this.tables.exportTable(request.actor!, tableId, readFormat(body));
  }

  @Post("workspace/data-tables/:tableId/import")
  importTable(@Req() request: ActorRequest, @Param("tableId") tableId: string, @Body() body: unknown) {
    const input = readImport(body);
    return this.tables.importTable(request.actor!, tableId, input.format, input.contentBase64);
  }
}

function record(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return body as Record<string, unknown>;
}

function readName(body: unknown) {
  const name = record(body).name;
  if (typeof name !== "string") {
    throw new BadRequestException(t("api.invalidBody"));
  }
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return trimmed;
}

function readOptionalFields(body: unknown) {
  const fields = record(body).fields;
  if (fields === undefined) {
    return undefined;
  }
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 100) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return fields.map((item) => readField(item));
}

function readField(body: unknown) {
  const data = record(body);
  const name = readName(body);
  if (typeof data.fieldType !== "string" || !isFieldType(data.fieldType)) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return {
    name,
    description: typeof data.description === "string" ? data.description : "",
    fieldType: data.fieldType as FieldType,
    format: typeof data.format === "string" ? data.format : "",
    options: readOptions(data.options),
    required: data.required === true,
    unique: data.unique === true,
    defaultValue: typeof data.defaultValue === "string" ? data.defaultValue : "",
    length: typeof data.length === "number" ? data.length : null,
  };
}

function readOptions(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return value.split(",");
  }
  return [];
}

function readRow(body: unknown) {
  const data = record(body);
  const cells: Record<string, string> = {};
  if (data.cells && typeof data.cells === "object") {
    for (const [key, value] of Object.entries(data.cells as Record<string, unknown>)) {
      if (typeof value === "string") {
        cells[key] = value;
      }
    }
  }
  const assigneeId = data.assigneeId;
  if (assigneeId !== undefined && assigneeId !== null && typeof assigneeId !== "string") {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return { cells, assigneeId: typeof assigneeId === "string" ? assigneeId : null };
}

function readNewView(body: unknown) {
  const data = record(body);
  if (typeof data.kind !== "string" || !isViewKind(data.kind)) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return { name: readName(body), kind: data.kind as ViewKind, shared: data.shared === true };
}

function readViewPatch(body: unknown) {
  const data = record(body);
  const patch: {
    name?: string;
    kind?: ViewKind;
    config?: ReturnType<typeof readViewConfig>;
    shared?: boolean;
  } = {};
  if (data.name !== undefined) {
    patch.name = readName(body);
  }
  if (data.kind !== undefined) {
    if (typeof data.kind !== "string" || !isViewKind(data.kind)) {
      throw new BadRequestException(t("api.invalidBody"));
    }
    patch.kind = data.kind;
  }
  if (data.config !== undefined) {
    patch.config = readViewConfig(data.config);
  }
  if (data.shared !== undefined) {
    if (typeof data.shared !== "boolean") {
      throw new BadRequestException(t("api.invalidBody"));
    }
    patch.shared = data.shared;
  }
  return patch;
}

function readFormat(body: unknown): "csv" | "xlsx" {
  const format = record(body).format;
  if (format !== "csv" && format !== "xlsx") {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return format;
}

function readImport(body: unknown) {
  const data = record(body);
  const format = readFormat(body);
  if (typeof data.contentBase64 !== "string" || data.contentBase64.length === 0) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  const name = data.name;
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 80)) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return {
    format,
    contentBase64: data.contentBase64,
    name: typeof name === "string" ? name.trim() : undefined,
  };
}

const maxBulkRows = 1000;

function readIds(body: unknown) {
  const ids = record(body).ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > maxBulkRows ||
    !ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)
  ) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return [...new Set(ids as string[])];
}

function readPageInt(value?: string) {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
