export const fieldTypes = ["text", "number", "date", "select", "checkbox", "uuid", "json"] as const;
export const fieldFormats = [
  "plain",
  "email",
  "phone",
  "url",
  "long",
  "integer",
  "decimal",
  "currency",
  "percent",
  "date",
  "datetime",
  "list",
  "boolean",
  "uuid",
  "code",
  "json",
] as const;
export const viewKinds = ["grid", "kanban", "calendar", "form"] as const;

export type FieldType = (typeof fieldTypes)[number];
export type FieldFormat = (typeof fieldFormats)[number];
export type ViewKind = (typeof viewKinds)[number];

const formatsByType: Record<FieldType, readonly FieldFormat[]> = {
  text: ["plain", "email", "phone", "url", "long"],
  number: ["integer", "decimal", "currency", "percent"],
  date: ["date", "datetime"],
  select: ["list"],
  checkbox: ["boolean"],
  uuid: ["uuid", "code"],
  json: ["json"],
};

export const idLengthMin = 4;
export const idLengthMax = 64;
export const idLengthDefault = 8;

const idAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function clampIdLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return idLengthDefault;
  }
  return Math.min(idLengthMax, Math.max(idLengthMin, Math.round(parsed)));
}

export function generateIdentifier(length: number) {
  const size = clampIdLength(length);
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += idAlphabet[byte % idAlphabet.length];
  }
  return out;
}

export function formatsFor(type: FieldType) {
  return [...formatsByType[type]];
}

export function defaultFormat(type: FieldType): FieldFormat {
  return formatsByType[type][0] ?? "plain";
}

export function isFieldFormat(type: FieldType, value: string): value is FieldFormat {
  return formatsByType[type].some((format) => format === value);
}

export function coerceFormat(type: FieldType, value: string): FieldFormat {
  return isFieldFormat(type, value) ? value : defaultFormat(type);
}

export type ViewConfig = {
  hiddenFieldIds: string[];
  sortFieldId: string | null;
  sortDirection: "asc" | "desc";
  filters: Array<{ fieldId: string; value: string }>;
  kanbanFieldId: string | null;
  calendarFieldId: string | null;
};

export function emptyViewConfig(): ViewConfig {
  return {
    hiddenFieldIds: [],
    sortFieldId: null,
    sortDirection: "asc",
    filters: [],
    kanbanFieldId: null,
    calendarFieldId: null,
  };
}

export function isFieldType(value: string): value is FieldType {
  return fieldTypes.some((type) => type === value);
}

export function isViewKind(value: string): value is ViewKind {
  return viewKinds.some((kind) => kind === value);
}

export function readViewConfig(value: unknown): ViewConfig {
  const base = emptyViewConfig();
  if (!value || typeof value !== "object") {
    return base;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.hiddenFieldIds)) {
    base.hiddenFieldIds = record.hiddenFieldIds.filter((item): item is string => typeof item === "string");
  }
  if (typeof record.sortFieldId === "string") {
    base.sortFieldId = record.sortFieldId;
  }
  if (record.sortDirection === "desc") {
    base.sortDirection = "desc";
  }
  if (Array.isArray(record.filters)) {
    base.filters = record.filters.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const filter = item as Record<string, unknown>;
      if (typeof filter.fieldId !== "string" || typeof filter.value !== "string") {
        return [];
      }
      return [{ fieldId: filter.fieldId, value: filter.value }];
    });
  }
  if (typeof record.kanbanFieldId === "string") {
    base.kanbanFieldId = record.kanbanFieldId;
  }
  if (typeof record.calendarFieldId === "string") {
    base.calendarFieldId = record.calendarFieldId;
  }
  return base;
}

export function normalizeStoredValue(
  field: { fieldType: FieldType; format: string; options: string[]; required: boolean; length?: number | null },
  raw: string,
) {
  const format = coerceFormat(field.fieldType, field.format);
  let value = raw.trim().slice(0, 4000);
  if (field.fieldType === "checkbox") {
    value = ["true", "1", "si", "sí", "yes", "x"].includes(value.toLowerCase()) ? "true" : "";
  }
  if (value === "") {
    if (field.required) {
      throw new Error("tables.requiredValue");
    }
    return "";
  }
  if (field.fieldType === "text") {
    if (format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      invalid();
    }
    if (format === "phone" && (value.replace(/\D/g, "").length < 6 || !/^[+\d()\-\s]+$/.test(value))) {
      invalid();
    }
    if (format === "url" && !/^https?:\/\/\S+$/i.test(value)) {
      invalid();
    }
    return value;
  }
  if (field.fieldType === "number") {
    const cleaned = value.replace(/[\s$%]/g, "").replace(",", ".");
    if (format === "integer") {
      if (!/^-?\d+$/.test(cleaned)) {
        invalid();
      }
      return cleaned;
    }
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      invalid();
    }
    return cleaned;
  }
  if (field.fieldType === "date") {
    if (format === "datetime") {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
        invalid();
      }
      return value.slice(0, 16);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      invalid();
    }
    return value;
  }
  if (field.fieldType === "select") {
    if (!field.options.includes(value)) {
      invalid();
    }
    return value;
  }
  if (field.fieldType === "uuid") {
    if (format === "code") {
      const length = clampIdLength(field.length ?? idLengthDefault);
      if (value.length !== length || !/^[A-Za-z0-9]+$/.test(value)) {
        invalid();
      }
      return value.toUpperCase();
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      invalid();
    }
    return value.toLowerCase();
  }
  if (field.fieldType === "json") {
    try {
      const stored = JSON.stringify(JSON.parse(value));
      if (stored.length > 4000) {
        invalid();
      }
      return stored;
    } catch {
      invalid();
    }
  }
  return value;
}

function invalid(): never {
  throw new Error("tables.invalidValue");
}
