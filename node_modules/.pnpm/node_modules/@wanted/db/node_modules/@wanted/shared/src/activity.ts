export const activityTones = ["success", "info", "warning", "error"] as const;
export type ActivityTone = (typeof activityTones)[number];

export const activityModules = ["tables"] as const;
export type ActivityModule = (typeof activityModules)[number];

export type ActivityFact = { label: string; value: string };

export type ActivityRefresh = {
  scope: "tables";
  kind: "set" | "table" | "rows";
  baseId?: string;
  tableId?: string;
};

export type ActivityRestore = {
  path: string;
  body?: { ids: string[] };
  until: string;
  refresh: ActivityRefresh;
};

export type ActivityDetail = {
  facts?: ActivityFact[];
  itemsLabel?: string;
  items?: string[];
  more?: number;
  restore?: ActivityRestore;
  restoredAt?: string;
};

export type ActivityInput = {
  module: ActivityModule;
  title: string;
  body: string;
  tone: ActivityTone;
  detail: ActivityDetail;
};

// Solo estas rutas pueden ir en "Restaurar": el aviso lo puede publicar otro usuario del espacio.
const restorePath =
  /^\/api\/workspace\/(bases\/[A-Za-z0-9-]{1,64}\/restore|data-tables\/[A-Za-z0-9-]{1,64}\/(restore|rows\/restore))$/;

const idPattern = /^[A-Za-z0-9-]{1,64}$/;

export function isActivityTone(value: unknown): value is ActivityTone {
  return typeof value === "string" && (activityTones as readonly string[]).includes(value);
}

export function isActivityModule(value: unknown): value is ActivityModule {
  return typeof value === "string" && (activityModules as readonly string[]).includes(value);
}

export function isRestorePath(value: unknown): value is string {
  return typeof value === "string" && restorePath.test(value);
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

function id(value: unknown) {
  return typeof value === "string" && idPattern.test(value) ? value : undefined;
}

function readRefresh(value: unknown): ActivityRefresh | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (raw.scope !== "tables" || (raw.kind !== "set" && raw.kind !== "table" && raw.kind !== "rows")) {
    return undefined;
  }
  return { scope: "tables", kind: raw.kind, baseId: id(raw.baseId), tableId: id(raw.tableId) };
}

function readRestore(value: unknown): ActivityRestore | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const refresh = readRefresh(raw.refresh);
  if (!isRestorePath(raw.path) || typeof raw.until !== "string" || Number.isNaN(Date.parse(raw.until)) || !refresh) {
    return undefined;
  }
  const restore: ActivityRestore = { path: raw.path, until: new Date(raw.until).toISOString(), refresh };
  const body = raw.body as { ids?: unknown } | undefined;
  if (body && Array.isArray(body.ids)) {
    const ids = body.ids.map(id).filter((item): item is string => Boolean(item)).slice(0, 1000);
    if (ids.length > 0) {
      restore.body = { ids };
    }
  }
  return restore;
}

export function readActivityDetail(value: unknown): ActivityDetail {
  if (!value || typeof value !== "object") {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const detail: ActivityDetail = {};
  if (Array.isArray(raw.facts)) {
    detail.facts = raw.facts
      .map((fact) => {
        const item = (fact ?? {}) as Record<string, unknown>;
        const label = text(item.label, 40);
        const content = text(item.value, 300);
        return label && content !== undefined ? { label, value: content } : null;
      })
      .filter((fact): fact is ActivityFact => fact !== null)
      .slice(0, 12);
  }
  const itemsLabel = text(raw.itemsLabel, 40);
  if (itemsLabel) {
    detail.itemsLabel = itemsLabel;
  }
  if (Array.isArray(raw.items)) {
    detail.items = raw.items
      .map((item) => text(item, 120))
      .filter((item): item is string => Boolean(item))
      .slice(0, 8);
  }
  if (typeof raw.more === "number" && Number.isFinite(raw.more)) {
    detail.more = Math.max(0, Math.min(1_000_000, Math.floor(raw.more)));
  }
  const restore = readRestore(raw.restore);
  if (restore) {
    detail.restore = restore;
  }
  if (typeof raw.restoredAt === "string" && !Number.isNaN(Date.parse(raw.restoredAt))) {
    detail.restoredAt = raw.restoredAt;
  }
  return detail;
}

export function readActivityInput(value: unknown): ActivityInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const title = text(raw.title, 120)?.trim();
  if (!title || !isActivityModule(raw.module) || !isActivityTone(raw.tone)) {
    return null;
  }
  return {
    module: raw.module,
    title,
    body: text(raw.body, 300) ?? "",
    tone: raw.tone,
    detail: readActivityDetail(raw.detail),
  };
}
