"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  clampIdLength,
  defaultFormat,
  emptyViewConfig,
  fieldTypes,
  formatsFor,
  generateIdentifier,
  idLengthDefault,
  idLengthMax,
  idLengthMin,
  t,
  type FieldFormat,
  type FieldType,
  type ViewConfig,
  type ViewKind,
} from "@wanted/shared";
import { api } from "@/lib/api";
import { useExitGhost } from "@/lib/exit-ghost";
import {
  notify,
  refreshEvent,
  type NoticeOptions,
  type RefreshDetail,
} from "@/lib/notify";
import { canOpen, useSpace, type Space } from "../shell";

type BaseItem = { id: string; name: string; canCreateTables?: boolean };
type TableAllowed = {
  createRows: boolean;
  editRows: boolean;
  deleteRows: boolean;
  export: boolean;
  manage: boolean;
};
const noTableAllowed: TableAllowed = {
  createRows: false,
  editRows: false,
  deleteRows: false,
  export: false,
  manage: false,
};
type TableItem = { id: string; name: string };
type ListedTable = { id: string; name: string; baseId: string; baseName: string };
type Field = {
  id: string;
  name: string;
  description: string;
  fieldType: FieldType;
  format: FieldFormat;
  options: string[];
  required: boolean;
  unique: boolean;
  defaultValue: string;
  length: number | null;
  position: number;
};

type ColumnInput = {
  name: string;
  description: string;
  fieldType: FieldType;
  format: FieldFormat;
  options: string;
  defaultValue: string;
  required: boolean;
  unique: boolean;
  length: number | null;
};
type DraftColumn = ColumnInput & { key: string; id?: string };
type DataRow = {
  id: string;
  createdBy: string | null;
  assigneeId: string | null;
  cells: Record<string, string>;
};
type DataView = {
  id: string;
  name: string;
  kind: ViewKind;
  shared: boolean;
  config: ViewConfig;
};
type Person = { id: string; name: string };
type Detail = {
  table: { id: string; name: string; baseId: string };
  fields: Field[];
  rows: DataRow[];
  views: DataView[];
  people: Person[];
  tooLarge?: boolean;
  caps?: TableAllowed;
  rowTotal?: number;
  hasMore?: boolean;
  rowsLoading?: boolean;
};
type TablePane = "columns" | "form" | "data";

type NoticeFn = (message: string, options?: NoticeOptions) => void;

const noticeItemsMax = 8;

function quoted(name: string) {
  return `«${name}»`;
}

function countLabel(count: number, one: string, many: string) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

function sampleItems(values: string[]) {
  const named = values.map((value) => value.trim()).filter(Boolean);
  return {
    items: named.slice(0, noticeItemsMax),
    more: Math.max(0, values.length - Math.min(named.length, noticeItemsMax)),
  };
}

function rowLabel(fields: Field[], cells: Record<string, string>) {
  for (const field of fields) {
    const value = (cells[field.id] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

const rowPageFirst = 80;
const rowPageNext = 150;
const densityKey = "wanted.tables.density";

const fieldLabel: Record<FieldType, "tables.text" | "tables.number" | "tables.date" | "tables.select" | "tables.checkbox" | "tables.uuid" | "tables.json"> = {
  text: "tables.text",
  number: "tables.number",
  date: "tables.date",
  select: "tables.select",
  checkbox: "tables.checkbox",
  uuid: "tables.uuid",
  json: "tables.json",
};

const formatLabel: Record<
  FieldFormat,
  | "tables.plain"
  | "tables.email"
  | "tables.phone"
  | "tables.url"
  | "tables.long"
  | "tables.integer"
  | "tables.decimal"
  | "tables.currency"
  | "tables.percent"
  | "tables.date"
  | "tables.datetime"
  | "tables.list"
  | "tables.boolean"
  | "tables.formatUuid"
  | "tables.formatCode"
  | "tables.json"
> = {
  plain: "tables.plain",
  email: "tables.email",
  phone: "tables.phone",
  url: "tables.url",
  long: "tables.long",
  integer: "tables.integer",
  decimal: "tables.decimal",
  currency: "tables.currency",
  percent: "tables.percent",
  date: "tables.date",
  datetime: "tables.datetime",
  list: "tables.list",
  boolean: "tables.boolean",
  uuid: "tables.formatUuid",
  code: "tables.formatCode",
  json: "tables.json",
};

function withFormat(row: DraftColumn, format: FieldFormat): DraftColumn {
  return { ...row, format, length: format === "code" ? (row.length ?? idLengthDefault) : null };
}


const months = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export default function TablesPage() {
  const space = useSpace();
  const [bases, setBases] = useState<BaseItem[]>([]);
  const [listed, setListed] = useState<ListedTable[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingColumns, setEditingColumns] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [viewId, setViewId] = useState("");
  const [config, setConfig] = useState<ViewConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<TablePane>("data");
  const [setId, setSetId] = useState("");
  const [setsOpen, setSetsOpen] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [editingSets, setEditingSets] = useState(false);
  const [shownTableId, setShownTableId] = useState("");
  const [shownSetId, setShownSetId] = useState("");
  const [sheetMotion, setSheetMotion] = useState<"idle" | "leave" | "enter">("idle");
  const [pickerMotion, setPickerMotion] = useState<"idle" | "leave" | "enter">("idle");
  const [railEnter, setRailEnter] = useState(false);
  const [railLeave, setRailLeave] = useState(false);
  const [createEnter, setCreateEnter] = useState(false);
  const [createLeave, setCreateLeave] = useState(false);
  const [bornTableId, setBornTableId] = useState("");
  const [dyingTableId, setDyingTableId] = useState("");
  const [dyingSetId, setDyingSetId] = useState("");
  const [emptyEnter, setEmptyEnter] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [importing, setImporting] = useState<string | null>(null);
  const [freshRows, setFreshRows] = useState<Record<string, number>>({});
  const setPicker = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const selectGen = useRef(0);
  const freshTimer = useRef(0);
  const railTimer = useRef(0);
  const createTimer = useRef(0);
  const bornTimer = useRef(0);
  const emptyTimer = useRef(0);

  function setError(message: string) {
    if (message) {
      notify({ title: message, tone: "error", source: t("modules.tables"), module: "tables", share: false });
    }
  }

  function setNotice(message: string, options: NoticeOptions = {}) {
    if (message) {
      notify({
        tone: "success",
        share: true,
        ...options,
        title: message,
        source: t("modules.tables"),
        module: "tables",
      });
    }
  }

  async function loadListed() {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await api("/api/workspace/bases", { signal: controller.signal });
      if (!response.ok) {
        setError(await readError(response));
        setBases([]);
        setListed([]);
        return { bases: [] as BaseItem[], tables: [] as ListedTable[] };
      }
      const nextBases = (await response.json()) as BaseItem[];
      setBases(nextBases);
      const groups = await Promise.all(
        nextBases.map(async (item) => {
          const baseResponse = await api(`/api/workspace/bases/${item.id}`, { signal: controller.signal });
          if (!baseResponse.ok) {
            return [];
          }
          const body = (await baseResponse.json()) as { id: string; name: string; tables: TableItem[] };
          return body.tables.map((table) => ({
            id: table.id,
            name: table.name,
            baseId: body.id,
            baseName: body.name,
          }));
        }),
      );
      const tables = groups.flat();
      setListed(tables);
      return { bases: nextBases, tables };
    } catch (cause) {
      const message =
        cause instanceof Error && cause.name === "AbortError"
          ? t("tables.loadFailed")
          : cause instanceof Error
            ? cause.message
            : t("tables.loadFailed");
      setError(message);
      setBases([]);
      setListed([]);
      return { bases: [] as BaseItem[], tables: [] as ListedTable[] };
    } finally {
      window.clearTimeout(timer);
      setLoaded(true);
    }
  }

  function markFreshRows(ids: string[]) {
    if (ids.length === 0 || !motionOk()) {
      return;
    }
    setFreshRows((current) => {
      const next = { ...current };
      ids.forEach((id, index) => {
        next[id] = Math.min(index, rowStaggerMax);
      });
      return next;
    });
    window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(
      () => setFreshRows({}),
      rowEnterMs + Math.min(ids.length, rowStaggerMax) * rowStepMs + 120,
    );
  }

  async function fillRemainingRows(tableId: string, startOffset: number, total: number, gen: number) {
    let offset = startOffset;
    while (offset < total) {
      if (gen !== selectGen.current) {
        return;
      }
      const response = await api(
        `/api/workspace/data-tables/${tableId}/rows?offset=${offset}&limit=${rowPageNext}`,
      );
      if (gen !== selectGen.current) {
        return;
      }
      if (!response.ok) {
        setDetail((current) =>
          current && current.table.id === tableId ? { ...current, rowsLoading: false, hasMore: false } : current,
        );
        return;
      }
      const body = (await response.json()) as { rows: DataRow[]; rowTotal: number; hasMore: boolean };
      if (gen !== selectGen.current) {
        return;
      }
      let addedIds: string[] = [];
      setDetail((current) => {
        if (!current || current.table.id !== tableId) {
          return current;
        }
        const seen = new Set(current.rows.map((row) => row.id));
        const added = body.rows.filter((row) => !seen.has(row.id));
        addedIds = added.map((row) => row.id);
        const rows = [...current.rows, ...added];
        return {
          ...current,
          rows,
          rowTotal: body.rowTotal,
          hasMore: body.hasMore,
          rowsLoading: body.hasMore,
        };
      });
      markFreshRows(addedIds);
      offset += body.rows.length;
      if (!body.hasMore || body.rows.length === 0) {
        break;
      }
      await wait(24);
    }
    if (gen === selectGen.current) {
      setDetail((current) =>
        current && current.table.id === tableId ? { ...current, rowsLoading: false, hasMore: false } : current,
      );
    }
  }

  async function fetchTablePage(tableId: string) {
    const response = await api(
      `/api/workspace/data-tables/${tableId}?limit=${rowPageFirst}&offset=0`,
    );
    if (!response.ok) {
      return { ok: false as const, error: await readError(response) };
    }
    const next = (await response.json()) as Detail;
    return {
      ok: true as const,
      detail: {
        ...next,
        rowsLoading: Boolean(next.hasMore),
      },
    };
  }

  async function openTable(tableId: string, preferredViewId?: string) {
    const gen = ++selectGen.current;
    const loaded = await fetchTablePage(tableId);
    if (gen !== selectGen.current) {
      return;
    }
    if (!loaded.ok) {
      setError(loaded.error);
      return;
    }
    const next = loaded.detail;
    const current = next.views.find((view) => view.id === (preferredViewId ?? viewId)) ?? next.views[0];
    setDetail(next);
    setViewId(current?.id ?? "");
    setConfig(current?.config ?? null);
    markFreshRows(next.rows.map((row) => row.id));
    if (next.hasMore) {
      void fillRemainingRows(tableId, next.rows.length, next.rowTotal ?? next.rows.length, gen);
    }
  }

  async function selectTable(
    tableId: string,
    nextSetId?: string,
    options?: { born?: boolean; enterOnly?: boolean },
  ) {
    const previousId = detail?.table.id ?? "";
    const previousSetId = detail?.table.baseId ?? "";
    const changingSet = Boolean(nextSetId && nextSetId !== previousSetId);
    const born = Boolean(options?.born);
    const enterOnly = Boolean(options?.enterOnly);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const switchAway = previousId !== "" && previousId !== tableId;
    const animate = !reduce && ((switchAway && !enterOnly) || born || enterOnly);
    const gen = ++selectGen.current;
    setShownTableId(tableId);
    setFreshRows({});
    if (animate && switchAway && !enterOnly) {
      setSheetMotion("leave");
      if (changingSet) {
        setPickerMotion("leave");
      }
    }
    const [loaded] = await Promise.all([
      fetchTablePage(tableId),
      animate && switchAway && !enterOnly ? wait(motionMs) : Promise.resolve(),
    ]);
    if (gen !== selectGen.current) {
      return;
    }
    if (!loaded.ok) {
      setShownTableId(previousId);
      setShownSetId(previousSetId);
      setSheetMotion("idle");
      setPickerMotion("idle");
      setError(loaded.error);
      return;
    }
    const next = loaded.detail;
    const grid = next.views.find((item) => item.kind === "grid") ?? next.views.find((item) => item.kind !== "form") ?? next.views[0];
    setPane("data");
    setEditingColumns(false);
    if (nextSetId) {
      setSetId(nextSetId);
    }
    setDetail(next);
    setViewId(grid?.id ?? "");
    setConfig(grid?.config ?? null);
    markFreshRows(next.rows.map((row) => row.id));
    if (gen !== selectGen.current) {
      return;
    }
    if (animate) {
      setSheetMotion("enter");
      setPickerMotion(changingSet ? "enter" : "idle");
      await wait(32);
    }
    if (gen !== selectGen.current) {
      return;
    }
    setSheetMotion("idle");
    setPickerMotion("idle");
    if (next.hasMore) {
      void fillRemainingRows(tableId, next.rows.length, next.rowTotal ?? next.rows.length, gen);
    }
  }

  useEffect(() => {
    if (!space || !canOpen(space.grants, "tables")) {
      return;
    }
    let cancel = false;
    void (async () => {
      const { tables } = await loadListed();
      if (!cancel && tables[0]) {
        await selectTable(tables[0].id);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [space]);

  useEffect(() => {
    return () => {
      window.clearTimeout(railTimer.current);
      window.clearTimeout(createTimer.current);
      window.clearTimeout(bornTimer.current);
      window.clearTimeout(emptyTimer.current);
      window.clearTimeout(freshTimer.current);
    };
  }, []);

  function motionOk() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function playRailEnter() {
    if (!motionOk()) {
      return;
    }
    window.clearTimeout(railTimer.current);
    setRailLeave(false);
    setRailEnter(true);
    railTimer.current = window.setTimeout(() => setRailEnter(false), 420);
  }

  function playCreateEnter() {
    if (!motionOk()) {
      return;
    }
    window.clearTimeout(createTimer.current);
    setCreateLeave(false);
    setCreateEnter(true);
    createTimer.current = window.setTimeout(() => setCreateEnter(false), 420);
  }

  function markBornTable(tableId: string) {
    if (!motionOk()) {
      return;
    }
    window.clearTimeout(bornTimer.current);
    setBornTableId(tableId);
    bornTimer.current = window.setTimeout(() => setBornTableId(""), 420);
  }

  function playEmptyEnter() {
    if (!motionOk()) {
      return;
    }
    window.clearTimeout(emptyTimer.current);
    setEmptyEnter(true);
    emptyTimer.current = window.setTimeout(() => setEmptyEnter(false), 420);
  }

  async function playExit(ms = motionMs) {
    if (!motionOk()) {
      return;
    }
    await wait(ms);
  }

  async function removeTable(tableId: string) {
    selectGen.current += 1;
    const baseId = detail?.table.baseId ?? listed.find((table) => table.id === tableId)?.baseId ?? setId;
    const next = listed.find((table) => table.id !== tableId && table.baseId === baseId) ?? null;
    setEditingColumns(false);
    setBusy(false);
    setError("");
    setDetail(null);
    setListed((current) => current.filter((table) => table.id !== tableId));
    setDyingTableId("");
    setCreateLeave(false);
    setSheetMotion("idle");
    setPickerMotion("idle");

    if (next) {
      setShownTableId(next.id);
      setShownSetId(next.baseId);
      setSetId(next.baseId);
      try {
        await selectTable(next.id, next.baseId, { enterOnly: true });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
      }
    } else {
      setShownTableId("");
      setSetId(baseId);
      setShownSetId(baseId);
      playEmptyEnter();
    }

    void (async () => {
      try {
        const gone = await sendJson<{
          name: string;
          baseId: string;
          baseName: string;
          rows: number;
          fields: number;
          restoreUntil: string;
        }>(`/api/workspace/data-tables/${tableId}`, undefined, "DELETE");
        setNotice(t("tables.tableDeleted"), {
          tone: "warning",
          body: `${quoted(gone.name)} ${t("tables.inSet")} ${quoted(gone.baseName)}`,
          detail: {
            facts: [
              { label: t("tables.factTable"), value: gone.name },
              { label: t("tables.factSet"), value: gone.baseName },
              { label: t("tables.factRows"), value: String(gone.rows) },
              { label: t("tables.factColumns"), value: String(gone.fields) },
            ],
            restore: {
              path: `/api/workspace/data-tables/${tableId}/restore`,
              until: gone.restoreUntil,
              refresh: { scope: "tables", kind: "table", tableId, baseId: gone.baseId },
            },
          },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
      }
      try {
        await loadListed();
      } catch {
        /* la lista optimista ya quitó la tabla */
      }
    })();
  }

  async function removeSet(id: string) {
    selectGen.current += 1;
    const removingActive = id === setId || id === detail?.table.baseId;
    const remainingBases = bases.filter((item) => item.id !== id);
    const remainingTables = listed.filter((table) => table.baseId !== id);
    setEditingSets(false);
    setSetsOpen(false);
    setBusy(false);
    setError("");
    setDyingSetId("");
    setBases(remainingBases);
    setListed(remainingTables);
    setSheetMotion("idle");
    setPickerMotion("idle");
    setRailLeave(false);
    setCreateLeave(false);

    if (remainingBases.length === 0) {
      setSetId("");
      setShownSetId("");
      setShownTableId("");
      setDetail(null);
      playEmptyEnter();
    } else if (removingActive) {
      const nextSet = remainingBases[0];
      setSetId(nextSet.id);
      setShownSetId(nextSet.id);
      const nextTable = remainingTables.find((table) => table.baseId === nextSet.id);
      if (nextTable) {
        try {
          await selectTable(nextTable.id, nextSet.id, { enterOnly: true });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
        }
      } else {
        setShownTableId("");
        setDetail(null);
        playEmptyEnter();
      }
    }

    void (async () => {
      try {
        const gone = await sendJson<{ name: string; tables: string[]; restoreUntil: string }>(
          `/api/workspace/bases/${id}`,
          undefined,
          "DELETE",
        );
        const sample = sampleItems(gone.tables);
        setNotice(t("tables.setDeleted"), {
          tone: "warning",
          body:
            gone.tables.length === 0
              ? `${quoted(gone.name)} · ${t("tables.setTablesNone").toLowerCase()}`
              : `${quoted(gone.name)} ${t("tables.withItsTables")} ${countLabel(
                  gone.tables.length,
                  t("tables.tableOne"),
                  t("tables.setTablesMany"),
                )}`,
          detail: {
            facts: [
              { label: t("tables.factSet"), value: gone.name },
              { label: t("tables.factTables"), value: String(gone.tables.length) },
            ],
            itemsLabel: gone.tables.length > 0 ? t("tables.itemsTables") : undefined,
            items: sample.items,
            more: sample.more,
            restore: {
              path: `/api/workspace/bases/${id}/restore`,
              until: gone.restoreUntil,
              refresh: { scope: "tables", kind: "set", baseId: id },
            },
          },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
      }
      try {
        await loadListed();
      } catch {
        /* la lista optimista ya quitó el conjunto */
      }
    })();
  }

  useEffect(() => {
    if (!setsOpen) {
      return;
    }
    function onPointer(event: MouseEvent) {
      if (!setPicker.current?.contains(event.target as Node)) {
        setSetsOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSetsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [setsOpen]);

  useEffect(() => {
    if (!exportOpen) {
      return;
    }
    function onPointer(event: MouseEvent) {
      if (!exportRef.current?.contains(event.target as Node)) {
        setExportOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    function onPointer(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [searchOpen]);

  useEffect(() => {
    setQuery("");
    setSearchOpen(false);
  }, [detail?.table.id]);

  useEffect(() => {
    const stored = window.localStorage.getItem(densityKey);
    if (stored === "compact" || stored === "comfortable") {
      setDensity(stored);
    }
  }, []);

  const refreshRef = useRef<(info: RefreshDetail) => Promise<void>>(async () => {});
  refreshRef.current = async (info) => {
    if (info.kind === "rows") {
      if (info.tableId && detail?.table.id === info.tableId) {
        await openTable(info.tableId, viewId);
      }
      return;
    }
    const { tables } = await loadListed();
    if (info.kind === "table" && info.tableId && tables.some((table) => table.id === info.tableId)) {
      await selectTable(info.tableId, info.baseId);
      return;
    }
    if (info.kind === "set" && info.baseId && !detail) {
      const first = tables.find((table) => table.baseId === info.baseId);
      if (first) {
        await selectTable(first.id, info.baseId);
      }
    }
  };

  useEffect(() => {
    function onRefresh(event: Event) {
      const info = (event as CustomEvent<RefreshDetail>).detail;
      if (info?.scope === "tables") {
        void refreshRef.current(info).catch((cause) => {
          setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
        });
      }
    }
    window.addEventListener(refreshEvent, onRefresh);
    return () => window.removeEventListener(refreshEvent, onRefresh);
  }, []);

  function toggleDensity() {
    setDensity((current) => {
      const next = current === "compact" ? "comfortable" : "compact";
      window.localStorage.setItem(densityKey, next);
      return next;
    });
  }

  if (!space) {
    return null;
  }
  if (!canOpen(space.grants, "tables")) {
    return <p className="muted">{t("api.forbidden")}</p>;
  }

  const caps = detail?.caps ?? noTableAllowed;
  const manageSets = space.manageSets;
  // Filas: agregar, editar, borrar y exportar. "manage" cubre columnas, nombre, vistas compartidas y borrar la tabla.
  const allowed = {
    create: caps.createRows,
    edit: caps.editRows,
    delete: caps.deleteRows,
    export: caps.export,
    share: caps.manage,
    manage: caps.manage,
  };
  const structure = { create: caps.manage, edit: caps.manage, delete: caps.manage };
  const creatableBases = bases.filter((item) => item.canCreateTables);
  const view = detail?.views.find((item) => item.id === viewId) ?? detail?.views[0] ?? null;
  const activeConfig = config ?? view?.config ?? null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
    } finally {
      setBusy(false);
    }
  }

  const showTransfer = Boolean(detail && allowed.export);
  const showRail = bases.length > 0 && Boolean(detail);
  const activeSetId = bases.some((item) => item.id === setId) ? setId : (bases[0]?.id ?? "");
  const displaySetId = bases.some((item) => item.id === shownSetId) ? shownSetId : activeSetId;
  const displaySet = bases.find((item) => item.id === displaySetId) ?? null;
  const setTables = listed.filter((table) => table.baseId === displaySetId);
  const activeTableId = shownTableId || detail?.table.id || "";

  function chooseSet(id: string) {
    setSetsOpen(false);
    if (id === activeSetId) {
      return;
    }
    setShownSetId(id);
    const tables = listed.filter((table) => table.baseId === id);
    if (tables.some((table) => table.id === detail?.table.id)) {
      setSetId(id);
      return;
    }
    if (tables[0]) {
      void selectTable(tables[0].id, id).catch((cause) => {
        setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
      });
      return;
    }
    void revealEmptySet(id).catch((cause) => {
      setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
    });
  }

  async function revealEmptySet(id: string) {
    const gen = ++selectGen.current;
    const animate = Boolean(detail) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate) {
      setSheetMotion("leave");
      setPickerMotion("leave");
      await wait(motionMs);
    }
    if (gen !== selectGen.current) {
      return;
    }
    setSetId(id);
    setShownTableId("");
    setDetail(null);
    if (animate) {
      setSheetMotion("enter");
      setPickerMotion("enter");
      await wait(32);
    }
    if (gen !== selectGen.current) {
      return;
    }
    setSheetMotion("idle");
    setPickerMotion("idle");
  }

  return (
    <section className={showRail ? "tables-screen" : "tables-screen no-rail"}>
      <div className="stack tables-main">
      {importing ? <ImportLoading name={importing} /> : null}
      {loaded ? (
        <div className="table-head">
          <div className="table-switch">
            <div className="set-picker" ref={setPicker}>
              <button
                className="set-trigger"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={setsOpen}
                onClick={() => setSetsOpen((current) => !current)}
              >
                <span key={displaySetId}>{displaySet?.name ?? t("tables.sets")}</span>
                <ChevronIcon />
              </button>
              {setsOpen ? (
                <div className="set-menu" role="dialog" aria-label={t("tables.sets")}>
                  <div className="set-menu-head">
                    <span className="set-menu-title">{t("tables.sets")}</span>
                    {bases.length > 0 ? <span className="set-menu-count">{bases.length}</span> : null}
                    <div className="set-menu-actions">
                      {manageSets ? (
                        <button
                          type="button"
                          aria-label={t("tables.newSet")}
                          data-tip={t("tables.newSet")}
                          onClick={() => {
                            setSetsOpen(false);
                            setEditingSets(false);
                            setCreatingSet(true);
                          }}
                        >
                          <PlusIcon />
                        </button>
                      ) : null}
                      {manageSets && bases.length > 0 ? (
                        <button
                          type="button"
                          aria-label={t("tables.editSetsTitle")}
                          data-tip={t("tables.editSetsTitle")}
                          onClick={() => {
                            setSetsOpen(false);
                            setCreatingSet(false);
                            setEditingSets(true);
                          }}
                        >
                          <PencilIcon />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {bases.length === 0 ? <p className="set-menu-empty">{t("tables.emptySets")}</p> : null}
                  {bases.length > 0 ? (
                    <div className="set-list" role="listbox" aria-label={t("tables.sets")}>
                      {bases.map((item) => {
                        const selected = item.id === displaySetId;
                        const count = listed.filter((table) => table.baseId === item.id).length;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="option"
                            className={selected ? "set-option is-selected" : "set-option"}
                            aria-selected={selected}
                            onClick={() => chooseSet(item.id)}
                          >
                            <span className="set-option-name">{item.name}</span>
                            <span className="set-option-count">
                              {count === 0
                                ? t("tables.setTablesNone")
                                : count === 1
                                  ? t("tables.setTablesOne")
                                  : `${count} ${t("tables.setTablesMany")}`}
                            </span>
                            <span className="set-option-check" aria-hidden="true">
                              {selected ? <SetCheckIcon /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <section className={pickerMotion === "leave" ? "table-picker is-leave" : "table-picker"} aria-label={t("modules.tables")}>
              {setTables.map((table) => {
                const selected = (shownTableId || detail?.table.id) === table.id;
                const born = table.id === bornTableId;
                const dying = table.id === dyingTableId;
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={
                      [selected ? "" : "ghost", born ? "is-born" : "", dying ? "is-dying" : ""]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    aria-pressed={selected}
                    onClick={() => {
                      void selectTable(table.id).catch((cause) => {
                        setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
                      });
                    }}
                  >
                    {table.name}
                  </button>
                );
              })}
            </section>
          </div>
          {displaySet?.canCreateTables && setTables.length > 0 ? (
            <button
              className={
                createLeave ? "table-create is-leave" : createEnter ? "table-create is-enter" : "table-create"
              }
              type="button"
              aria-pressed={creating}
              onClick={() => {
                setSetsOpen(false);
                setEditingColumns(false);
                setCreating((current) => !current);
              }}
            >
              <PlusIcon />
              {t("tables.createTable")}
            </button>
          ) : null}
        </div>
      ) : null}

      {creating && creatableBases.length > 0 ? (
        <CreateTable
          key={activeSetId}
          bases={creatableBases}
          defaultBaseId={creatableBases.some((item) => item.id === activeSetId) ? activeSetId : creatableBases[0].id}
          busy={busy}
          canImport
          onClose={() => setCreating(false)}
          onCreate={(baseId, name, columns) =>
            void run(async () => {
              const firstTable = listed.filter((table) => table.baseId === baseId).length === 0;
              const created = await sendJson<{ id: string }>(`/api/workspace/bases/${baseId}/tables`, {
                name,
                fields: columns,
              });
              setCreating(false);
              setSetId(baseId);
              await loadListed();
              markBornTable(created.id);
              await selectTable(created.id, undefined, { born: true });
              const setName = bases.find((item) => item.id === baseId)?.name ?? "";
              const names = columns.map((column) => column.name.trim()).filter(Boolean);
              const sample = sampleItems(names);
              setNotice(t("tables.tableCreated"), {
                body: `${quoted(name)} ${t("tables.inSet")} ${quoted(setName)} · ${countLabel(
                  names.length,
                  t("tables.columnOneShort"),
                  t("tables.columnMany"),
                )}`,
                detail: {
                  facts: [
                    { label: t("tables.factTable"), value: name },
                    { label: t("tables.factSet"), value: setName },
                  ],
                  itemsLabel: t("tables.itemsColumns"),
                  items: sample.items,
                  more: sample.more,
                },
              });
              if (firstTable) {
                playCreateEnter();
              }
            })
          }
          onImport={(baseId, file) => {
            setCreating(false);
            void run(async () => {
              const firstTable = listed.filter((table) => table.baseId === baseId).length === 0;
              const stem = file.name.replace(/\.(csv|xlsx)$/i, "").trim().slice(0, 80);
              const label = stem || t("tables.importedTable");
              const setName = bases.find((item) => item.id === baseId)?.name ?? "";
              setImporting(label);
              try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                const format = detectImportFormat(file, bytes);
                const contentBase64 = bytesToBase64(bytes);
                const created = await sendJson<{ id: string; name: string; imported?: number }>(
                  `/api/workspace/bases/${baseId}/import`,
                  {
                    format,
                    contentBase64,
                    name: stem || undefined,
                  },
                );
                const tableName = created.name || label;
                setListed((current) =>
                  current.some((item) => item.id === created.id)
                    ? current
                    : [
                        ...current,
                        {
                          id: created.id,
                          name: tableName,
                          baseId,
                          baseName: setName,
                        },
                      ],
                );
                setSetId(baseId);
                setShownSetId(baseId);
                setShownTableId(created.id);
                markBornTable(created.id);
                await loadListed();
                await selectTable(created.id, baseId, { born: true });
                const imported = created.imported ?? 0;
                setNotice(t("tables.imported"), {
                  body: `${quoted(tableName)} ${t("tables.inSet")} ${quoted(setName)} · ${countLabel(
                    imported,
                    t("tables.selectedOneShort"),
                    t("tables.selectedManyShort"),
                  )}`,
                  detail: {
                    facts: [
                      { label: t("tables.factTable"), value: tableName },
                      { label: t("tables.factSet"), value: setName },
                      { label: t("tables.factFile"), value: file.name },
                      { label: t("tables.factFormat"), value: format === "xlsx" ? "Excel" : "CSV" },
                      { label: t("tables.factRows"), value: String(imported) },
                    ],
                  },
                });
                if (firstTable) {
                  playCreateEnter();
                }
              } finally {
                setImporting(null);
              }
            });
          }}
        />
      ) : null}

      {creatingSet ? (
        <SetNameForm
          busy={busy}
          onClose={() => setCreatingSet(false)}
          onCreate={(name) =>
            void run(async () => {
              const firstSet = bases.length === 0;
              const created = await sendJson<{ id: string }>("/api/workspace/bases", { name });
              setCreatingSet(false);
              setSetId(created.id);
              setShownSetId(created.id);
              setDetail(null);
              setNotice(t("tables.setCreated"), {
                body: quoted(name),
                detail: { facts: [{ label: t("tables.factSet"), value: name }] },
              });
              await loadListed();
              if (firstSet) {
                playRailEnter();
              }
            })
          }
        />
      ) : null}

      {editingSets ? (
        <SetEditor
          bases={bases}
          listed={listed}
          canEdit={manageSets}
          canDelete={manageSets}
          canCreate={manageSets}
          busy={busy}
          onClose={() => setEditingSets(false)}
          onCreateNew={() => {
            setEditingSets(false);
            setCreatingSet(true);
          }}
          onRename={(id, name) =>
            void run(async () => {
              const before = bases.find((item) => item.id === id)?.name ?? "";
              await sendJson(`/api/workspace/bases/${id}`, { name });
              setNotice(t("tables.setRenamed"), {
                body: `${quoted(before)} → ${quoted(name)}`,
                detail: {
                  facts: [
                    { label: t("tables.factBefore"), value: before },
                    { label: t("tables.factAfter"), value: name },
                  ],
                },
              });
              await loadListed();
            })
          }
          dyingId={dyingSetId}
          onDelete={(id) => {
            void removeSet(id).catch((cause) => {
              setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
              void loadListed();
            });
          }}
        />
      ) : null}

      {!loaded ? <p className="muted">{t("tables.loading")}</p> : null}

      {loaded && !detail && (bases.length === 0 || setTables.length === 0) ? (
        <div className={emptyEnter ? "tables-empty is-enter" : "tables-empty"}>
          {bases.length === 0 ? (
            <>
              <EmptySetsArt />
              <p>{t("tables.emptySets")}</p>
              <p className="muted">{manageSets ? t("tables.emptySetsHint") : t("tables.emptySetsNoAccess")}</p>
              {manageSets ? (
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSetsOpen(false);
                      setEditingSets(false);
                      setCreatingSet(true);
                    }}
                  >
                    <PlusIcon />
                    {t("tables.newSet")}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <EmptyTablesArt />
              <p>{t("tables.emptySetTables")}</p>
              <p className="muted">
                {displaySet?.canCreateTables ? t("tables.emptySetTablesHint") : t("tables.emptySetTablesNoAccess")}
              </p>
              {displaySet?.canCreateTables ? (
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSetsOpen(false);
                      setEditingColumns(false);
                      setCreating(true);
                    }}
                  >
                    <PlusIcon />
                    {t("tables.createTable")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {detail && (detail.tooLarge || detail.fields.length === 0) ? (
        <div className="tables-empty">
          <p>{t("tables.tableTooLarge")}</p>
          {allowed.manage ? (
            <div className="actions">
              <button type="button" onClick={() => setEditingColumns(true)}>
                {t("tables.editColumns")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {detail && !detail.tooLarge && detail.fields.length > 0 && view && activeConfig ? (
        <div className={sheetMotion === "idle" ? "table-stage" : `table-stage is-${sheetMotion}`}>
        <Sheet
          detail={detail}
          view={view}
          config={activeConfig}
          allowed={allowed}
          busy={busy}
          freshRows={freshRows}
          query={query}
          density={density}
          entry
          onBack={() => setDetail(null)}
          onConfig={setConfig}
          onView={(id) => {
            const next = detail.views.find((item) => item.id === id);
            setViewId(id);
            setConfig(next?.config ?? null);
          }}
          onReload={(preferredViewId) => openTable(detail.table.id, preferredViewId)}
          onRun={run}
          onNotice={setNotice}
          pane={pane}
          onPane={setPane}
          onRename={(name) =>
            void run(async () => {
              const before = detail.table.name;
              await sendJson(`/api/workspace/data-tables/${detail.table.id}`, { name });
              setNotice(t("tables.tableRenamed"), {
                body: `${quoted(before)} → ${quoted(name)}`,
                detail: {
                  facts: [
                    { label: t("tables.factBefore"), value: before },
                    { label: t("tables.factAfter"), value: name },
                  ],
                },
              });
              await loadListed();
              await openTable(detail.table.id);
            })
          }
        />
        </div>
      ) : null}

      {editingColumns && detail ? (
        <EditColumns
          detail={detail}
          allowed={structure}
          busy={busy}
          onClose={() => setEditingColumns(false)}
          onRun={run}
          onReload={() => openTable(detail.table.id)}
          onNotice={setNotice}
          onDeleteTable={() => {
            const id = detail.table.id;
            setEditingColumns(false);
            void removeTable(id).catch((cause) => {
              setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
              void loadListed();
            });
          }}
        />
      ) : null}
      </div>

      {showRail ? (
        <aside
          className={railLeave ? "tables-rail is-leave" : railEnter ? "tables-rail is-enter" : "tables-rail"}
          aria-label={t("modules.tables")}
        >
          {detail && allowed.manage ? (
            <IconButton label={t("tables.editColumn")} active={editingColumns} onClick={() => setEditingColumns(true)}>
              <PencilIcon />
            </IconButton>
          ) : null}
          {detail ? (
            <IconButton label={t("tables.form")} active={pane === "form"} disabled={busy} onClick={() => setPane("form")}>
              <FormIcon />
            </IconButton>
          ) : null}
          {detail ? <hr className="rail-line" /> : null}
          {detail ? (
            <div className="rail-pop" ref={searchRef}>
              <IconButton
                label={t("tables.search")}
                active={searchOpen}
                dot={query.trim() !== ""}
                onClick={() => setSearchOpen((open) => !open)}
              >
                <SearchIcon />
              </IconButton>
              {searchOpen ? (
                <div className="rail-menu rail-search" role="search">
                  <SearchIcon />
                  <input
                    type="search"
                    value={query}
                    autoFocus
                    aria-label={t("tables.search")}
                    placeholder={t("tables.searchHint")}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        if (query) {
                          setQuery("");
                        } else {
                          setSearchOpen(false);
                        }
                      }
                      if (event.key === "Enter") {
                        setSearchOpen(false);
                      }
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {detail ? (
            <IconButton
              label={density === "compact" ? t("tables.densityComfortable") : t("tables.densityCompact")}
              active={density === "compact"}
              onClick={toggleDensity}
            >
              <DensityIcon compact={density === "compact"} />
            </IconButton>
          ) : null}
          {detail ? (
            <IconButton
              label={t("tables.reload")}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await openTable(detail.table.id, viewId);
                  setNotice(t("tables.reloaded"), {
                    tone: "info",
                    share: false,
                    body: quoted(detail.table.name),
                  });
                })
              }
            >
              <RefreshIcon />
            </IconButton>
          ) : null}
          {showTransfer ? <hr className="rail-line" /> : null}
          {detail && allowed.export ? (
            <div className="rail-pop" ref={exportRef}>
              <IconButton
                label={t("tables.export")}
                active={exportOpen}
                disabled={busy}
                onClick={() => setExportOpen((open) => !open)}
              >
                <FileDownIcon />
              </IconButton>
              {exportOpen ? (
                <div className="rail-menu" role="menu" aria-label={t("tables.export")}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      setExportOpen(false);
                      void run(() => download(detail.table.id, "csv"));
                    }}
                  >
                    {t("tables.exportCsv")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      setExportOpen(false);
                      void run(() => download(detail.table.id, "xlsx"));
                    }}
                  >
                    {t("tables.exportXlsx")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}

function IconButton({
  label,
  active,
  disabled,
  dot,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  dot?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "icon-button ghost is-active" : "icon-button ghost"}
      aria-label={label}
      aria-pressed={active}
      data-tip={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {dot ? <span className="icon-dot" aria-hidden="true" /> : null}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function DensityIcon({ compact }: { compact: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {compact ? <path d="M5 6h14M5 10h14M5 14h14M5 18h14" /> : <path d="M5 7h14M5 12h14M5 17h14" />}
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </svg>
  );
}

function ImportLoading({ name }: { name: string }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return createPortal(
    <div className="modal-backdrop import-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="import-panel">
        <div className="import-spinner" aria-hidden="true" />
        <h2>{t("tables.importing")}</h2>
        <p className="import-name">{name}</p>
        <p className="muted">{t("tables.importingHint")}</p>
      </div>
    </div>,
    document.body,
  );
}

function EmptySetsArt() {
  return (
    <svg className="tables-empty-art" viewBox="0 0 160 112" aria-hidden="true">
      <rect className="art-panel art-back" x="28" y="18" width="88" height="64" rx="12" />
      <rect className="art-panel art-mid" x="38" y="28" width="88" height="64" rx="12" />
      <rect className="art-panel art-front" x="48" y="38" width="88" height="64" rx="12" />
      <path className="art-line" d="M62 58h60M62 70h44" />
      <circle className="art-mark" cx="128" cy="30" r="14" />
      <path className="art-mark-plus" d="M128 24v12M122 30h12" />
    </svg>
  );
}

function EmptyTablesArt() {
  return (
    <svg className="tables-empty-art" viewBox="0 0 160 112" aria-hidden="true">
      <rect className="art-panel art-front" x="28" y="20" width="104" height="76" rx="12" />
      <path className="art-line art-strong" d="M28 44h104" />
      <path className="art-line" d="M62 20v76M96 20v76" />
      <path className="art-line" d="M40 58h16M72 58h16M106 58h16M40 72h16M72 72h16M106 72h16" />
      <circle className="art-mark" cx="128" cy="28" r="14" />
      <path className="art-mark-plus" d="M128 22v12M122 28h12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  );
}

function SetCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function FileDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M12 11v6" />
      <path d="M9.5 14.5 12 17l2.5-2.5" />
    </svg>
  );
}

function FormIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function NameEditor({
  name,
  label,
  canEdit,
  busy,
  onSave,
}: {
  name: string;
  label: string;
  canEdit: boolean;
  busy: boolean;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    setDraft(name);
  }, [name]);
  if (!canEdit) {
    return <strong>{name}</strong>;
  }
  return (
    <form
      className="name-edit"
      onSubmit={(event) => {
        event.preventDefault();
        const next = draft.trim();
        if (next && next !== name) {
          onSave(next);
        }
      }}
    >
      <label>
        <span>{label}</span>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} required maxLength={80} />
      </label>
      <button type="submit" disabled={busy || draft.trim() === name}>
        {t("members.save")}
      </button>
    </form>
  );
}

function SetNameForm({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Floating title={t("tables.newSet")} onClose={onClose} className="modal-form modal-form-sm">
      <form
        className="create-form is-simple"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(name.trim());
        }}
      >
        <div className="create-identity is-single">
          <label>
            <span>{t("tables.setName")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              placeholder={t("tables.setNameHint")}
              autoFocus
            />
          </label>
        </div>
        <div className="create-footer">
          <button type="submit" disabled={busy || name.trim() === ""}>
            {t("tables.newSet")}
          </button>
        </div>
      </form>
    </Floating>
  );
}

function SetEditor({
  bases,
  listed,
  canEdit,
  canDelete,
  canCreate,
  busy,
  dyingId,
  onClose,
  onCreateNew,
  onRename,
  onDelete,
}: {
  bases: BaseItem[];
  listed: ListedTable[];
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  busy: boolean;
  dyingId?: string;
  onClose: () => void;
  onCreateNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState("");
  const [openId, setOpenId] = useState("");
  return (
    <Floating title={t("tables.editSetsTitle")} onClose={onClose} className="modal-form">
      <div className="create-form is-fill">
        <section className="create-section" aria-labelledby="edit-sets-title">
          <div className="create-section-head">
            <div className="create-section-title">
              <h3 id="edit-sets-title">{t("tables.sets")}</h3>
              <span className="muted">
                {bases.length === 1 ? t("tables.setOne") : `${bases.length} ${t("tables.setMany")}`}
              </span>
            </div>
            {canCreate ? (
              <button className="ghost mini" type="button" disabled={busy} onClick={onCreateNew}>
                {t("tables.newSet")}
              </button>
            ) : null}
          </div>
          <div className="create-columns set-edit-list">
            {bases.map((item, index) => {
              const tables = listed.filter((table) => table.baseId === item.id);
              const tableCount = tables.length;
              const confirming = confirmId === item.id;
              const open = openId === item.id;
              const tablesLabel =
                tableCount === 0
                  ? t("tables.setTablesNone")
                  : tableCount === 1
                    ? t("tables.setTablesOne")
                    : `${tableCount} ${t("tables.setTablesMany")}`;
              return (
                <div
                  className={dyingId === item.id ? "create-column is-dying" : "create-column"}
                  key={item.id}
                >
                  <span className="create-column-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="create-column-fields">
                    <NameEditor
                      name={item.name}
                      label={t("tables.setName")}
                      canEdit={canEdit}
                      busy={busy}
                      onSave={(next) => onRename(item.id, next)}
                    />
                    <button
                      className={open ? "ghost mini set-tables-toggle is-open" : "ghost mini set-tables-toggle"}
                      type="button"
                      aria-expanded={open}
                      disabled={busy}
                      onClick={() => setOpenId((current) => (current === item.id ? "" : item.id))}
                    >
                      <span>{tablesLabel}</span>
                      <ChevronIcon />
                    </button>
                    {open ? (
                      <ul className="set-tables-list">
                        {tables.length === 0 ? (
                          <li className="muted">{t("tables.emptySetTables")}</li>
                        ) : (
                          tables.map((table) => <li key={table.id}>{table.name}</li>)
                        )}
                      </ul>
                    ) : null}
                    {canDelete && confirming ? (
                      <div className="set-delete-confirm">
                        <p className="muted">{t("tables.deleteSetConfirm")}</p>
                        {tableCount > 0 ? <p className="muted">{tablesLabel}</p> : null}
                        <div className="actions">
                          <button type="button" disabled={busy} onClick={() => onDelete(item.id)}>
                            {t("tables.deleteSet")}
                          </button>
                          <button className="ghost" type="button" disabled={busy} onClick={() => setConfirmId("")}>
                            {t("members.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {canDelete && !confirming ? (
                    <button
                      className="ghost mini create-column-remove"
                      type="button"
                      disabled={busy}
                      aria-label={t("tables.remove")}
                      title={t("tables.remove")}
                      onClick={() => setConfirmId(item.id)}
                    >
                      ×
                    </button>
                  ) : (
                    <span className="create-column-spacer" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Floating>
  );
}

function SortIcon({ direction }: { direction?: "asc" | "desc" | null }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {direction === "desc" ? (
        <path d="M12 5v14m0 0-5-5m5 5 5-5" />
      ) : direction === "asc" ? (
        <path d="M12 19V5m0 0-5 5m5-5 5 5" />
      ) : (
        <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      )}
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CreateTable({
  bases,
  defaultBaseId,
  busy,
  canImport,
  onClose,
  onCreate,
  onImport,
}: {
  bases: BaseItem[];
  defaultBaseId: string;
  busy: boolean;
  canImport: boolean;
  onClose: () => void;
  onCreate: (baseId: string, name: string, columns: ColumnInput[]) => void;
  onImport: (baseId: string, file: File) => void;
}) {
  const [name, setName] = useState("");
  const [baseId, setBaseId] = useState(defaultBaseId);
  const [columns, setColumns] = useState<DraftColumn[]>(() => [
    { ...emptyColumn(), name: t("tables.nameField"), key: nextDraftKey() },
  ]);
  const fileInput = useRef<HTMLInputElement>(null);
  const columnsList = useRef<HTMLDivElement>(null);
  const maxCreateColumns = 100;

  function addColumn() {
    if (columns.length >= maxCreateColumns) {
      return;
    }
    const key = nextDraftKey();
    setColumns((current) => [...current, { ...emptyColumn(), key }]);
    window.setTimeout(() => {
      const row = columnsList.current?.querySelector<HTMLElement>(`[data-column-key="${key}"]`);
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      row?.querySelector<HTMLInputElement>("input.create-column-name")?.focus();
    }, 0);
  }

  return (
    <Floating title={t("tables.createTable")} onClose={onClose} className="modal-form">
      <form
        className="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(baseId, name, columns);
        }}
      >
        <div className="create-top">
          <div className="create-identity">
            <label>
              <span>{t("tables.set")}</span>
              <select value={baseId} onChange={(event) => setBaseId(event.target.value)} disabled={busy}>
                {bases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("tables.tableName")}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                placeholder={t("tables.tableNameHint")}
                autoFocus
              />
            </label>
          </div>

          {canImport ? (
            <div className="create-split">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    onImport(baseId, file);
                  }
                }}
              />
              <button className="ghost" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
                {t("tables.importFile")}
              </button>
            </div>
          ) : null}
        </div>

        <section className="create-section" aria-labelledby="create-columns-title">
          <div className="create-section-head">
            <div className="create-section-title">
              <h3 id="create-columns-title">{t("tables.columns")}</h3>
              <span className="muted">
                {columns.length === 1
                  ? t("tables.columnOne")
                  : `${columns.length} ${t("tables.columnMany")}`}
                {columns.length >= 40 ? ` · ${t("tables.columnsMaxHint")}` : null}
              </span>
            </div>
            <button
              className="ghost mini"
              type="button"
              disabled={busy || columns.length >= maxCreateColumns}
              onClick={addColumn}
            >
              {t("tables.addColumn")}
            </button>
          </div>
          <CreateColumnList
            listRef={columnsList}
            rows={columns}
            busy={busy}
            onChange={(key, next) => setColumns((current) => current.map((item) => (item.key === key ? next : item)))}
            onRemove={(key) => setColumns((current) => current.filter((item) => item.key !== key))}
          />
        </section>

        <div className="create-footer">
          <button type="submit" disabled={busy || name.trim() === "" || columns.length === 0}>
            {t("tables.createTable")}
          </button>
        </div>
      </form>
    </Floating>
  );
}

function CreateColumnList({
  rows,
  busy,
  listRef,
  onChange,
  onRemove,
  extended = false,
  lockExisting = false,
  canDeleteExisting = true,
}: {
  rows: DraftColumn[];
  busy: boolean;
  listRef?: RefObject<HTMLDivElement | null>;
  onChange: (key: string, next: DraftColumn) => void;
  onRemove: (key: string) => void;
  extended?: boolean;
  lockExisting?: boolean;
  canDeleteExisting?: boolean;
}) {
  return (
    <div className="create-columns" ref={listRef}>
      {rows.map((row, index) => {
        const formats = formatsFor(row.fieldType);
        const locked = Boolean(row.id) && lockExisting;
        const canRemove = rows.length > 1 && (!row.id || canDeleteExisting);
        return (
          <div className="create-column" key={row.key} data-column-key={row.key}>
            <span className="create-column-index" aria-hidden="true">
              {index + 1}
            </span>
            <div className={extended ? "create-column-fields is-edit" : "create-column-fields"}>
              <input
                className="create-column-name"
                aria-label={t("tables.fieldName")}
                value={row.name}
                required
                maxLength={80}
                disabled={busy || locked}
                placeholder={t("tables.fieldName")}
                onChange={(event) => onChange(row.key, { ...row, name: event.target.value })}
              />
              <select
                aria-label={t("tables.fieldType")}
                value={row.fieldType}
                disabled={busy || locked}
                onChange={(event) => {
                  const fieldType = event.target.value as FieldType;
                  onChange(row.key, withFormat({ ...row, fieldType }, defaultFormat(fieldType)));
                }}
              >
                {fieldTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(fieldLabel[type])}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("tables.format")}
                value={row.format}
                disabled={busy || locked || formats.length < 2}
                onChange={(event) => onChange(row.key, withFormat(row, event.target.value as FieldFormat))}
              >
                {formats.map((format) => (
                  <option key={format} value={format}>
                    {t(formatLabel[format])}
                  </option>
                ))}
              </select>
              {row.fieldType === "uuid" && row.format === "code" ? (
                <label className="create-column-options id-length">
                  <span>{t("tables.idLength")}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={idLengthMin}
                    max={idLengthMax}
                    step={1}
                    required
                    disabled={busy || locked}
                    value={row.length ?? idLengthDefault}
                    onChange={(event) =>
                      onChange(row.key, {
                        ...row,
                        length: event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    onBlur={() => onChange(row.key, { ...row, length: clampIdLength(row.length ?? idLengthDefault) })}
                  />
                  <span className="id-length-hint">{t("tables.idLengthHint")}</span>
                </label>
              ) : null}
              {row.fieldType === "select" ? (
                <input
                  className="create-column-options"
                  aria-label={t("tables.options")}
                  value={row.options}
                  required
                  disabled={busy || locked}
                  placeholder={t("tables.options")}
                  onChange={(event) => onChange(row.key, { ...row, options: event.target.value })}
                />
              ) : null}
              {extended ? (
                <div className="create-column-extra">
                  <input
                    aria-label={t("tables.purpose")}
                    value={row.description}
                    maxLength={240}
                    disabled={busy || locked}
                    placeholder={t("tables.purpose")}
                    onChange={(event) => onChange(row.key, { ...row, description: event.target.value })}
                  />
                  <input
                    aria-label={t("tables.defaultValue")}
                    value={row.defaultValue}
                    disabled={busy || locked}
                    placeholder={t("tables.defaultValue")}
                    onChange={(event) => onChange(row.key, { ...row, defaultValue: event.target.value })}
                  />
                  <label className="check-inline">
                    <input
                      aria-label={t("tables.required")}
                      type="checkbox"
                      checked={row.required}
                      disabled={busy || locked}
                      onChange={(event) => onChange(row.key, { ...row, required: event.target.checked })}
                    />
                    {t("tables.required")}
                  </label>
                  <label className="check-inline">
                    <input
                      aria-label={t("tables.unique")}
                      type="checkbox"
                      checked={row.unique}
                      disabled={busy || locked}
                      onChange={(event) => onChange(row.key, { ...row, unique: event.target.checked })}
                    />
                    {t("tables.unique")}
                  </label>
                </div>
              ) : null}
            </div>
            {canRemove ? (
              <button
                className="ghost mini create-column-remove"
                type="button"
                disabled={busy}
                aria-label={t("tables.remove")}
                title={t("tables.remove")}
                onClick={() => onRemove(row.key)}
              >
                ×
              </button>
            ) : (
              <span className="create-column-spacer" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditColumns({
  detail,
  allowed,
  busy,
  onClose,
  onRun,
  onReload,
  onNotice,
  onDeleteTable,
}: {
  detail: Detail;
  allowed: { create: boolean; edit: boolean; delete: boolean };
  busy: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<void>) => void;
  onReload: () => Promise<void>;
  onNotice: NoticeFn;
  onDeleteTable?: () => void;
}) {
  const [rows, setRows] = useState<DraftColumn[]>(() =>
    detail.fields.map((field) => ({ ...columnFromField(field), key: field.id, id: field.id })),
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const columnsList = useRef<HTMLDivElement>(null);
  const heavy = rows.length > 80;
  const maxEditColumns = 100;

  function addColumn() {
    if (rows.length >= maxEditColumns) {
      return;
    }
    const key = nextDraftKey();
    setRows((current) => [...current, { ...emptyColumn(), key }]);
    window.setTimeout(() => {
      const row = columnsList.current?.querySelector<HTMLElement>(`[data-column-key="${key}"]`);
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      row?.querySelector<HTMLInputElement>("input.create-column-name")?.focus();
    }, 0);
  }

  return (
    <Floating title={t("tables.editColumns")} onClose={onClose} className="modal-form modal-form-edit">
      {heavy ? (
        <div className="create-form is-simple">
          <p className="muted">{t("tables.importTooManyColumns")}</p>
          {allowed.delete && onDeleteTable ? (
            <div className="create-footer has-aside">
              <button className="ghost" type="button" disabled={busy} onClick={onDeleteTable}>
                {t("tables.deleteTable")}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <form
          className="create-form is-edit"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            onRun(async () => {
              try {
                const names = rows.map((row) => row.name.trim().toLowerCase());
                if (new Set(names).size !== names.length) {
                  throw new Error(t("tables.nameTaken"));
                }
                for (const row of rows.filter((item) => !item.id)) {
                  await sendJson(`/api/workspace/data-tables/${detail.table.id}/fields`, row);
                }
                if (allowed.edit) {
                  for (const row of rows) {
                    if (!row.id) {
                      continue;
                    }
                    await sendJson(`/api/workspace/data-fields/${row.id}`, row);
                  }
                }
                for (const id of removed) {
                  await sendJson(`/api/workspace/data-fields/${id}`, undefined, "DELETE");
                }
                const added = rows.filter((row) => !row.id).map((row) => row.name.trim());
                const removedNames = detail.fields
                  .filter((field) => removed.includes(field.id))
                  .map((field) => field.name);
                const changes = [
                  added.length > 0 ? `${added.length} ${t("tables.addedShort")}` : "",
                  removedNames.length > 0 ? `${removedNames.length} ${t("tables.removedShort")}` : "",
                ].filter(Boolean);
                onNotice(t("tables.columnSaved"), {
                  body: `${quoted(detail.table.name)} · ${countLabel(
                    rows.length,
                    t("tables.columnOneShort"),
                    t("tables.columnMany"),
                  )}${changes.length > 0 ? ` (${changes.join(", ")})` : ""}`,
                  detail: {
                    facts: [
                      { label: t("tables.factTable"), value: detail.table.name },
                      { label: t("tables.factColumns"), value: String(rows.length) },
                      ...(added.length > 0 ? [{ label: t("tables.factAdded"), value: added.join(", ") }] : []),
                      ...(removedNames.length > 0
                        ? [{ label: t("tables.factRemoved"), value: removedNames.join(", ") }]
                        : []),
                    ],
                  },
                });
                await onReload();
                onClose();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
                throw cause;
              }
            });
          }}
        >
          <section className="create-section" aria-labelledby="edit-columns-title">
            <div className="create-section-head">
              <div className="create-section-title">
                <h3 id="edit-columns-title">{t("tables.columns")}</h3>
                <span className="muted">
                  {rows.length === 1 ? t("tables.columnOne") : `${rows.length} ${t("tables.columnMany")}`}
                  {rows.length >= 40 ? ` · ${t("tables.columnsMaxHint")}` : null}
                </span>
              </div>
              {allowed.create ? (
                <button
                  className="ghost mini"
                  type="button"
                  disabled={busy || rows.length >= maxEditColumns}
                  onClick={addColumn}
                >
                  {t("tables.addColumn")}
                </button>
              ) : null}
            </div>
            <div className="create-columns-wrap">
              {error ? <p className="error">{error}</p> : null}
              <CreateColumnList
                extended
                listRef={columnsList}
                rows={rows}
                busy={busy}
                lockExisting={!allowed.edit}
                canDeleteExisting={allowed.delete}
                onChange={(key, next) => setRows((current) => current.map((item) => (item.key === key ? next : item)))}
                onRemove={(key) => {
                  const row = rows.find((item) => item.key === key);
                  if (row?.id) {
                    setRemoved((current) => [...current, row.id!]);
                  }
                  setRows((current) => current.filter((item) => item.key !== key));
                }}
              />
            </div>
          </section>

          <div className={allowed.delete && onDeleteTable ? "create-footer has-aside" : "create-footer"}>
            {allowed.delete && onDeleteTable ? (
              confirmDelete ? (
                <div className="set-delete-confirm create-footer-danger">
                  <p className="muted">{t("tables.deleteTableConfirm")}</p>
                  <div className="actions">
                    <button type="button" disabled={busy} onClick={onDeleteTable}>
                      {t("tables.deleteTable")}
                    </button>
                    <button className="ghost" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                      {t("members.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="ghost" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  {t("tables.deleteTable")}
                </button>
              )
            ) : null}
            {allowed.edit || allowed.create ? (
              <button type="submit" disabled={busy || rows.length === 0}>
                {t("tables.saveColumns")}
              </button>
            ) : null}
          </div>
        </form>
      )}
    </Floating>
  );
}

function Bases({
  bases,
  canCreate,
  canEdit,
  canDelete,
  busy,
  onOpen,
  onRename,
  onCreate,
  onDelete,
}: {
  bases: BaseItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="stack">
      <h2 className="module-title">{t("tables.bases")}</h2>
      {bases.length === 0 ? <p className="muted">{t("tables.emptyBases")}</p> : null}
      {bases.map((item) => (
        <div className="panel stack" key={item.id}>
          <NameEditor
            name={item.name}
            label={t("tables.baseName")}
            canEdit={canEdit}
            busy={busy}
            onSave={(next) => onRename(item.id, next)}
          />
          <div className="actions">
            <button type="button" onClick={() => onOpen(item.id)}>
              {t("tables.open")}
            </button>
            {canDelete ? (
              <button className="ghost" type="button" disabled={busy} onClick={() => onDelete(item.id)}>
                {t("tables.remove")}
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {canCreate ? (
        <form
          className="panel create-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(name);
            setName("");
          }}
        >
          <label>
            {t("tables.baseName")}
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          </label>
          <button type="submit" disabled={busy}>
            {t("tables.createBase")}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Tables({
  base,
  canCreate,
  canEdit,
  canDelete,
  busy,
  onBack,
  onRename,
  onOpen,
  onCreate,
  onDelete,
}: {
  base: { id: string; name: string; tables: TableItem[] };
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onBack: () => void;
  onRename: (id: string, name: string) => void;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="stack">
      <div className="actions">
        <button className="ghost" type="button" onClick={onBack}>
          {t("tables.back")}
        </button>
        <h2 className="module-title">{base.name}</h2>
      </div>
      {base.tables.length === 0 ? <p className="muted">{t("tables.emptyTables")}</p> : null}
      {base.tables.map((item) => (
        <div className="panel stack" key={item.id}>
          <NameEditor
            name={item.name}
            label={t("tables.tableName")}
            canEdit={canEdit}
            busy={busy}
            onSave={(next) => onRename(item.id, next)}
          />
          <div className="actions">
            <button type="button" onClick={() => onOpen(item.id)}>
              {t("tables.configure")}
            </button>
            {canDelete ? (
              <button className="ghost" type="button" disabled={busy} onClick={() => onDelete(item.id)}>
                {t("tables.remove")}
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {canCreate ? (
        <form
          className="panel create-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(name);
            setName("");
          }}
        >
          <label>
            {t("tables.tableName")}
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          </label>
          <button type="submit" disabled={busy}>
            {t("tables.createTable")}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Sheet({
  detail,
  view,
  config,
  allowed,
  busy,
  onBack,
  onConfig,
  onView,
  onReload,
  onRun,
  onNotice,
  pane,
  onPane,
  onRename,
  freshRows = {},
  query = "",
  density = "comfortable",
  entry,
}: {
  detail: Detail;
  view: DataView;
  config: ViewConfig;
  allowed: { create: boolean; edit: boolean; delete: boolean; export: boolean; share: boolean; manage: boolean };
  busy: boolean;
  onBack: () => void;
  onConfig: (config: ViewConfig) => void;
  onView: (id: string) => void;
  onReload: (preferredViewId?: string) => Promise<void>;
  onRun: (action: () => Promise<void>) => void;
  onNotice: NoticeFn;
  pane: TablePane;
  onPane: (pane: TablePane) => void;
  onRename: (name: string) => void;
  freshRows?: Record<string, number>;
  query?: string;
  density?: "comfortable" | "compact";
  entry?: boolean;
}) {
  const needle = query.trim().toLowerCase();
  const [pickedCells, setPickedCells] = useState<string[]>([]);
  const [anchorCell, setAnchorCell] = useState<{ rowId: string; fieldId: string } | null>(null);
  const shiftHeld = useRef(false);
  const [editingSelection, setEditingSelection] = useState<DataRow[] | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [rowCount, setRowCount] = useState(1);
  const shownFields = detail.fields.filter((field) => !config.hiddenFieldIds.includes(field.id));
  const viewRows = applyView(detail.rows, config);
  const rows = needle
    ? viewRows.filter((row) =>
        shownFields.some((field) => (row.cells[field.id] ?? "").toLowerCase().includes(needle)),
      )
    : viewRows;
  const visibleKey = rows.map((row) => row.id).join("\n");
  const shownKey = shownFields.map((field) => field.id).join("\n");
  const picked = new Set(pickedCells);
  const selectedIds = new Set(pickedCells.map((key) => key.split("\t")[0]));
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const allSelected =
    rows.length > 0 &&
    shownFields.length > 0 &&
    rows.every((row) => shownFields.every((field) => picked.has(cellKey(row.id, field.id))));
  const indexDigits = Math.max(2, String(Math.max(rows.length, detail.rowTotal ?? 0, 1)).length);
  const checkColPx = 34 + indexDigits * 7;

  useEffect(() => {
    setPickedCells([]);
    setAnchorCell(null);
    setEditingSelection(null);
    setAddingRow(false);
    setRowCount(1);
  }, [detail.table.id]);

  useEffect(() => {
    const visibleRows = new Set(visibleKey ? visibleKey.split("\n") : []);
    const visibleFields = new Set(shownKey ? shownKey.split("\n") : []);
    setPickedCells((current) => {
      const next = current.filter((key) => {
        const [rowId, fieldId] = key.split("\t");
        return visibleRows.has(rowId) && visibleFields.has(fieldId);
      });
      return next.length === current.length ? current : next;
    });
    setAnchorCell((current) =>
      current && visibleRows.has(current.rowId) && visibleFields.has(current.fieldId) ? current : null,
    );
  }, [visibleKey, shownKey]);

  function cycleSort(fieldId: string) {
    if (config.sortFieldId !== fieldId) {
      onConfig({ ...config, sortFieldId: fieldId, sortDirection: "asc" });
      return;
    }
    if (config.sortDirection === "asc") {
      onConfig({ ...config, sortDirection: "desc" });
      return;
    }
    onConfig({ ...config, sortFieldId: null });
  }

  function pickCell(rowId: string, fieldId: string, shift: boolean) {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    const colIndex = shownFields.findIndex((field) => field.id === fieldId);
    if (rowIndex < 0 || colIndex < 0) {
      return;
    }
    if (shift && anchorCell) {
      const anchorRow = rows.findIndex((row) => row.id === anchorCell.rowId);
      const anchorCol = shownFields.findIndex((field) => field.id === anchorCell.fieldId);
      if (anchorRow >= 0 && anchorCol >= 0) {
        setPickedCells(rangeCells(rows, shownFields, anchorRow, anchorCol, rowIndex, colIndex));
        return;
      }
    }
    setPickedCells([cellKey(rowId, fieldId)]);
    setAnchorCell({ rowId, fieldId });
  }

  function toggleRow(row: DataRow, rowIndex: number, shift: boolean) {
    if (shownFields.length === 0) {
      return;
    }
    if (shift && anchorCell) {
      const anchorRow = rows.findIndex((item) => item.id === anchorCell.rowId);
      if (anchorRow >= 0) {
        setPickedCells(rangeCells(rows, shownFields, anchorRow, 0, rowIndex, shownFields.length - 1));
        return;
      }
    }
    const keys = shownFields.map((field) => cellKey(row.id, field.id));
    const full = keys.every((key) => picked.has(key));
    setPickedCells((current) => {
      const without = current.filter((key) => !key.startsWith(`${row.id}\t`));
      return full ? without : [...without, ...keys];
    });
    setAnchorCell({ rowId: row.id, fieldId: shownFields[0].id });
  }

  return (
    <div className="stack">
      {!entry ? (
        <div className="actions">
          <button className="ghost" type="button" onClick={onBack}>
            {t("tables.back")}
          </button>
          <NameEditor
            name={detail.table.name}
            label={t("tables.tableName")}
            canEdit={allowed.manage}
            busy={busy}
            onSave={onRename}
          />
        </div>
      ) : null}

      {!entry ? (
      <div className="actions">
        <button className={pane === "columns" ? undefined : "ghost"} type="button" onClick={() => onPane("columns")}>
          {t("tables.columns")}
        </button>
        <button className={pane === "form" ? undefined : "ghost"} type="button" onClick={() => onPane("form")}>
          {t("tables.form")}
        </button>
        <button
          className={pane === "data" ? undefined : "ghost"}
          type="button"
          onClick={() => {
            onPane("data");
            if (view.kind === "form") {
              const grid = detail.views.find((item) => item.kind === "grid") ?? detail.views.find((item) => item.kind !== "form");
              if (grid) {
                onView(grid.id);
              }
            }
          }}
        >
          {t("tables.data")}
        </button>
      </div>
      ) : null}

      {pane === "columns" ? (
        <ColumnsPane
          detail={detail}
          allowed={{ create: allowed.manage, edit: allowed.manage, delete: allowed.manage }}
          busy={busy}
          onReload={onReload}
          onRun={onRun}
          onNotice={onNotice}
        />
      ) : null}
      {pane === "form" ? (
        <FormPane
          detail={detail}
          allowed={{ create: allowed.create, edit: allowed.manage, share: allowed.manage }}
          busy={busy}
          onReload={onReload}
          onRun={onRun}
          onNotice={onNotice}
        />
      ) : null}

      {pane === "data" ? (
      <>
      {detail.views.filter((item) => !entry || item.kind !== "form").length > 1 ? (
      <div className="actions">
        {detail.views.filter((item) => !entry || item.kind !== "form").map((item) => (
          <button
            key={item.id}
            className={item.id === view.id ? undefined : "ghost"}
            type="button"
            onClick={() => {
              if (item.kind === "form") {
                onPane("form");
                return;
              }
              onView(item.id);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      ) : null}

      {view.kind === "grid" ? (
        <div className="grid-frame">
        <div className="grid-scroll">
          <table
            className={density === "compact" ? "sheet-table is-compact" : "sheet-table"}
            style={
              {
                "--sheet-check-w": `${checkColPx}px`,
                "--sheet-index-ch": `${indexDigits}ch`,
              } as CSSProperties
            }
          >
            <colgroup>
              <col className="sheet-check-col" />
              {shownFields.map((field) => (
                <col key={field.id} className="sheet-data-col" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="row-select">
                  <div className="row-select-inner is-head">
                    <input
                      type="checkbox"
                      aria-label={t("tables.selectAllRows")}
                      checked={allSelected}
                      ref={(node) => {
                        if (node) {
                          node.indeterminate = pickedCells.length > 0 && !allSelected;
                        }
                      }}
                      disabled={busy || rows.length === 0}
                      onChange={() => {
                        if (allSelected) {
                          setPickedCells([]);
                          setAnchorCell(null);
                          return;
                        }
                        setPickedCells(
                          rows.flatMap((row) => shownFields.map((field) => cellKey(row.id, field.id))),
                        );
                        if (rows[0] && shownFields[0]) {
                          setAnchorCell({ rowId: rows[0].id, fieldId: shownFields[0].id });
                        }
                      }}
                    />
                  </div>
                </th>
                {shownFields.map((field, index) => {
                  const sorted = config.sortFieldId === field.id;
                  const sortLabel = sorted
                    ? config.sortDirection === "desc"
                      ? t("tables.desc")
                      : t("tables.asc")
                    : t("tables.sort");
                  return (
                    <th key={field.id} className={index === 0 ? "sticky-col" : undefined} title={field.description}>
                      <div className="sheet-head">
                        <span className="sheet-head-name">
                          {field.name}
                          {field.required ? " *" : ""}
                        </span>
                        <button
                          className={sorted ? "sheet-sort is-active" : "sheet-sort"}
                          type="button"
                          aria-label={`${t("tables.sort")}: ${field.name} (${sortLabel})`}
                          title={sortLabel}
                          disabled={busy}
                          onClick={() => cycleSort(field.id)}
                        >
                          <SortIcon direction={sorted ? config.sortDirection : null} />
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="row-select" />
                  <td className="sheet-empty" colSpan={shownFields.length}>
                    {needle ? t("tables.noMatches") : t("tables.noRows")}
                  </td>
                </tr>
              ) : null}
              {rows.map((row, rowIndex) => {
                const rowKeys = shownFields.map((field) => cellKey(row.id, field.id));
                const rowFull = rowKeys.length > 0 && rowKeys.every((key) => picked.has(key));
                const rowSome = rowKeys.some((key) => picked.has(key));
                return (
                <tr
                  key={row.id}
                  className={row.id in freshRows ? "sheet-row-enter" : undefined}
                  style={row.id in freshRows ? ({ "--row-i": freshRows[row.id] } as CSSProperties) : undefined}
                >
                  <td className="row-select">
                    <div className="row-select-inner">
                      <span className="row-index" aria-hidden="true">
                        {rowIndex + 1}
                      </span>
                      <input
                        type="checkbox"
                        aria-label={`${t("tables.selectRow")} ${rowIndex + 1}`}
                        checked={rowFull}
                        ref={(node) => {
                          if (node) {
                            node.indeterminate = rowSome && !rowFull;
                          }
                        }}
                        disabled={busy}
                        onPointerDown={(event) => {
                          shiftHeld.current = event.shiftKey;
                        }}
                        onKeyDown={(event) => {
                          shiftHeld.current = event.shiftKey;
                        }}
                        onChange={() => toggleRow(row, rowIndex, shiftHeld.current)}
                      />
                    </div>
                  </td>
                  {shownFields.map((field, index) => {
                    const key = cellKey(row.id, field.id);
                    const names = [index === 0 ? "sticky-col" : "", picked.has(key) ? "cell-selected" : ""].filter(Boolean);
                    return (
                    <td
                      key={field.id}
                      className={names.join(" ") || undefined}
                      aria-selected={picked.has(key)}
                      onMouseDown={(event) => {
                        if (event.shiftKey) {
                          event.preventDefault();
                        }
                      }}
                      onClick={(event) => {
                        if (!busy) {
                          pickCell(row.id, field.id, event.shiftKey);
                        }
                      }}
                    >
                      <CellText field={field} value={row.cells[field.id] ?? ""} />
                    </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          {detail.rowsLoading ? (
            <div className="sheet-loading" role="status" aria-live="polite">
              <span className="sheet-loading-pill">
                <span className="sheet-loading-spinner" aria-hidden="true" />
                <span>{t("tables.loadingRows")}</span>
                {detail.rowTotal ? (
                  <span className="sheet-loading-count">
                    {detail.rows.length.toLocaleString("es")} / {detail.rowTotal.toLocaleString("es")}
                  </span>
                ) : null}
              </span>
              {detail.rowTotal ? (
                <span
                  className="sheet-loading-bar"
                  aria-hidden="true"
                  style={{ width: `${Math.min(100, (detail.rows.length / detail.rowTotal) * 100)}%` }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {view.kind === "grid" && selectedRows.length > 0
        ? createPortal(
            <div className="row-bar" role="toolbar" aria-label={t("tables.selectedMany")}>
              <span className="row-bar-count">
                <strong>{selectedRows.length}</strong>
                {selectedRows.length === 1 ? t("tables.selectedOneShort") : t("tables.selectedManyShort")}
              </span>
              {allowed.edit || allowed.delete ? <span className="row-bar-divider" aria-hidden="true" /> : null}
              {allowed.edit ? (
                <button type="button" disabled={busy} onClick={() => setEditingSelection(selectedRows)}>
                  <PencilIcon />
                  {t("tables.editColumn")}
                </button>
              ) : null}
              {allowed.delete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onRun(async () => {
                      const tableId = detail.table.id;
                      const labels = selectedRows.map((row) => rowLabel(shownFields, row.cells));
                      const gone = await sendJson<{ ids: string[]; restoreUntil: string }>(
                        `/api/workspace/data-tables/${tableId}/rows/delete`,
                        { ids: selectedRows.map((row) => row.id) },
                      );
                      setPickedCells([]);
                      setAnchorCell(null);
                      await onReload();
                      const sample = sampleItems(labels);
                      onNotice(gone.ids.length === 1 ? t("tables.rowDeleted") : t("tables.rowsDeleted"), {
                        tone: "warning",
                        body: `${countLabel(
                          gone.ids.length,
                          t("tables.selectedOneShort"),
                          t("tables.selectedManyShort"),
                        )} ${t("tables.ofTable")} ${quoted(detail.table.name)}`,
                        detail: {
                          facts: [
                            { label: t("tables.factTable"), value: detail.table.name },
                            { label: t("tables.factRows"), value: String(gone.ids.length) },
                          ],
                          itemsLabel: t("tables.itemsRows"),
                          items: sample.items,
                          more: sample.more,
                          restore: {
                            path: `/api/workspace/data-tables/${tableId}/rows/restore`,
                            body: { ids: gone.ids },
                            until: gone.restoreUntil,
                            refresh: { scope: "tables", kind: "rows", tableId, baseId: detail.table.baseId },
                          },
                        },
                      });
                    })
                  }
                >
                  <TrashIcon />
                  {t("tables.remove")}
                </button>
              ) : null}
              <span className="row-bar-divider" aria-hidden="true" />
              <button
                className="row-bar-close"
                type="button"
                aria-label={t("tables.clearSelection")}
                title={t("tables.clearSelection")}
                onClick={() => {
                  setPickedCells([]);
                  setAnchorCell(null);
                }}
              >
                <CloseIcon />
              </button>
            </div>,
            document.body,
          )
        : null}

      {editingSelection ? (
        <EditRows
          rows={editingSelection}
          fields={detail.fields}
          tableName={detail.table.name}
          busy={busy}
          onClose={() => setEditingSelection(null)}
          onRun={onRun}
          onReload={onReload}
          onNotice={onNotice}
        />
      ) : null}

      {view.kind === "kanban" ? (
        <Kanban detail={detail} rows={rows} config={config} onConfig={onConfig} />
      ) : null}
      {view.kind === "calendar" ? (
        <Calendar detail={detail} rows={rows} config={config} onConfig={onConfig} />
      ) : null}
      {allowed.create && view.kind !== "form" ? (
        <div className="sheet-add">
          <button className="raised-button" type="button" disabled={busy} onClick={() => setAddingRow(true)}>
            <PlusIcon />
            {rowCount === 1 ? t("tables.addRow") : `${t("tables.addRows")} · ${rowCount}`}
          </button>
          <div className="row-stepper" role="group" aria-label={t("tables.rowCount")}>
            <button
              type="button"
              aria-label={t("tables.fewerRows")}
              title={t("tables.fewerRows")}
              disabled={busy || rowCount <= 1}
              onClick={() => setRowCount((current) => Math.max(1, current - 1))}
            >
              <MinusIcon />
            </button>
            <output aria-live="polite">{rowCount}</output>
            <button
              type="button"
              aria-label={t("tables.moreRows")}
              title={t("tables.moreRows")}
              disabled={busy || rowCount >= 10}
              onClick={() => setRowCount((current) => Math.min(10, current + 1))}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      ) : null}

      {addingRow ? (
        <NewRow
          fields={detail.fields}
          tableId={detail.table.id}
          tableName={detail.table.name}
          count={rowCount}
          busy={busy}
          onClose={() => setAddingRow(false)}
          onRun={onRun}
          onReload={onReload}
          onNotice={onNotice}
        />
      ) : null}

      </>
      ) : null}
    </div>
  );
}

function ColumnsPane({
  detail,
  allowed,
  busy,
  onReload,
  onRun,
  onNotice,
}: {
  detail: Detail;
  allowed: { create: boolean; edit: boolean; delete: boolean };
  busy: boolean;
  onReload: () => Promise<void>;
  onRun: (action: () => Promise<void>) => void;
  onNotice: NoticeFn;
}) {
  return (
    <div className="stack">
      <p className="muted">{t("tables.columnsIntro")}</p>
    </div>
  );
}

function emptyColumn(): ColumnInput {
  return {
    name: "",
    description: "",
    fieldType: "text",
    format: "plain",
    options: "",
    defaultValue: "",
    required: false,
    unique: false,
    length: null,
  };
}

function columnFromField(field: Field): ColumnInput {
  return {
    name: field.name,
    description: field.description,
    fieldType: field.fieldType,
    format: field.format,
    options: field.options.join(", "),
    defaultValue: field.defaultValue,
    required: field.required,
    unique: field.unique,
    length: field.length,
  };
}

function nextDraftKey() {
  return crypto.randomUUID();
}

function cellKey(rowId: string, fieldId: string) {
  return `${rowId}\t${fieldId}`;
}

function rangeCells(
  rows: DataRow[],
  fields: Field[],
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
) {
  const keys: string[] = [];
  const rowStart = Math.min(fromRow, toRow);
  const rowEnd = Math.max(fromRow, toRow);
  const colStart = Math.min(fromCol, toCol);
  const colEnd = Math.max(fromCol, toCol);
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    for (let colIndex = colStart; colIndex <= colEnd; colIndex += 1) {
      const row = rows[rowIndex];
      const field = fields[colIndex];
      if (row && field) {
        keys.push(cellKey(row.id, field.id));
      }
    }
  }
  return keys;
}

function CellText({ field, value }: { field: Field; value: string }) {
  const shown = field.fieldType === "checkbox" ? (value === "true" ? t("tables.yes") : t("tables.no")) : value;
  return (
    <span className={field.fieldType === "number" ? "cell-value is-number" : "cell-value"} title={shown}>
      {shown}
    </span>
  );
}

function EditRows({
  rows,
  fields,
  tableName,
  busy,
  onClose,
  onRun,
  onReload,
  onNotice,
}: {
  rows: DataRow[];
  fields: Field[];
  tableName: string;
  busy: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<void>) => void;
  onReload: () => Promise<void>;
  onNotice: NoticeFn;
}) {
  const [drafts, setDrafts] = useState(() =>
    rows.map((row) => ({ id: row.id, assigneeId: row.assigneeId, cells: { ...row.cells } })),
  );
  const [error, setError] = useState("");
  return (
    <Floating title={rows.length === 1 ? t("tables.editRow") : t("tables.editRows")} onClose={onClose}>
      {error ? <p className="error">{error}</p> : null}
      <div className="column-grid">
        <table>
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.id}>
                  {field.name}
                  {field.required ? " *" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft, index) => (
              <tr key={draft.id}>
                {fields.map((field) => (
                  <td key={field.id}>
                    <ValueControl
                      field={field}
                      value={draft.cells[field.id] ?? ""}
                      disabled={busy}
                      onChange={(value) =>
                        setDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, cells: { ...item.cells, [field.id]: value } } : item,
                          ),
                        )
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onRun(async () => {
            try {
              for (const draft of drafts) {
                const cells: Record<string, string> = {};
                for (const field of fields) {
                  cells[field.id] = draft.cells[field.id] ?? "";
                }
                await sendJson(`/api/workspace/data-rows/${draft.id}`, { cells, assigneeId: draft.assigneeId });
              }
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
              return;
            }
            await onReload();
            const sample = sampleItems(drafts.map((draft) => rowLabel(fields, draft.cells)));
            onNotice(t("tables.rowsSaved"), {
              body: `${countLabel(drafts.length, t("tables.selectedOneShort"), t("tables.selectedManyShort"))} ${t(
                "tables.ofTable",
              )} ${quoted(tableName)}`,
              detail: {
                facts: [
                  { label: t("tables.factTable"), value: tableName },
                  { label: t("tables.factRows"), value: String(drafts.length) },
                ],
                itemsLabel: t("tables.itemsRows"),
                items: sample.items,
                more: sample.more,
              },
            });
            onClose();
          })
        }
      >
        {t("tables.saveChanges")}
      </button>
    </Floating>
  );
}

function NewRow({
  fields,
  tableId,
  tableName,
  count,
  busy,
  onClose,
  onRun,
  onReload,
  onNotice,
}: {
  fields: Field[];
  tableId: string;
  tableName: string;
  count: number;
  busy: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<void>) => void;
  onReload: () => Promise<void>;
  onNotice: NoticeFn;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>[]>(() => blankRows(fields, count));
  const [error, setError] = useState("");
  const title = drafts.length === 1 ? t("tables.addRow") : t("tables.addRows");
  return (
    <Floating title={title} onClose={onClose}>
      {error ? <p className="error">{error}</p> : null}
      <div className="column-grid">
        <table>
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.id}>
                  {field.name}
                  {field.required ? " *" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((cells, rowIndex) => (
              <tr key={rowIndex}>
                {fields.map((field) => (
                  <td key={field.id}>
                    <ValueControl
                      field={field}
                      value={cells[field.id] ?? ""}
                      disabled={busy}
                      onChange={(value) =>
                        setDrafts((current) =>
                          current.map((row, index) => (index === rowIndex ? { ...row, [field.id]: value } : row)),
                        )
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (drafts.some((cells) => !rowHasContent(cells))) {
            setError(t("tables.emptyRow"));
            return;
          }
          onRun(async () => {
            try {
              for (const cells of drafts) {
                const payload: Record<string, string> = {};
                for (const field of fields) {
                  payload[field.id] = cells[field.id] ?? "";
                }
                await sendJson(`/api/workspace/data-tables/${tableId}/rows`, { cells: payload, assigneeId: null });
              }
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : t("api.invalidBody"));
              return;
            }
            await onReload();
            const sample = sampleItems(drafts.map((cells) => rowLabel(fields, cells)));
            onNotice(drafts.length === 1 ? t("tables.rowAdded") : `${drafts.length} ${t("tables.rowsAdded")}`, {
              body: `${countLabel(drafts.length, t("tables.selectedOneShort"), t("tables.selectedManyShort"))} ${t(
                "tables.inTable",
              )} ${quoted(tableName)}`,
              detail: {
                facts: [
                  { label: t("tables.factTable"), value: tableName },
                  { label: t("tables.factRows"), value: String(drafts.length) },
                ],
                itemsLabel: t("tables.itemsRows"),
                items: sample.items,
                more: sample.more,
              },
            });
            onClose();
          });
        }}
      >
        {title}
      </button>
    </Floating>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function Floating({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  useExitGhost(backdrop);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" ref={backdrop} onMouseDown={onClose}>
      <div
        className={className ? `modal ${className}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="ghost modal-close"
            type="button"
            aria-label={t("shell.close")}
            title={t("shell.close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function FormPane({
  detail,
  allowed,
  busy,
  onReload,
  onRun,
  onNotice,
}: {
  detail: Detail;
  allowed: { create: boolean; edit: boolean; share: boolean };
  busy: boolean;
  onReload: () => Promise<void>;
  onRun: (action: () => Promise<void>) => void;
  onNotice: NoticeFn;
}) {
  const forms = detail.views.filter((item) => item.kind === "form");
  const [formId, setFormId] = useState(forms[0]?.id ?? "");
  const current = forms.find((item) => item.id === formId) ?? forms[0];
  const visible = current
    ? detail.fields.filter((field) => !current.config.hiddenFieldIds.includes(field.id))
    : detail.fields;

  return (
    <div className="stack">
      <p className="muted">{t("tables.formIntro")}</p>
      {forms.length > 1 ? (
        <div className="actions">
          {forms.map((item) => (
            <button
              key={item.id}
              className={item.id === current?.id ? undefined : "ghost"}
              type="button"
              onClick={() => setFormId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {current ? (
        <div className="panel stack">
          <strong>{current.name}</strong>
          <p className="muted">{t("tables.formFields")}</p>
          {detail.fields.map((field) => {
            const included = !current.config.hiddenFieldIds.includes(field.id);
            return (
              <label className="check-line" key={field.id}>
                <input
                  type="checkbox"
                  checked={included}
                  disabled={!allowed.edit || busy || (included && visible.length <= 1)}
                  onChange={() => {
                    const hiddenFieldIds = included
                      ? [...current.config.hiddenFieldIds, field.id]
                      : current.config.hiddenFieldIds.filter((id) => id !== field.id);
                    onRun(async () => {
                      await sendJson(`/api/workspace/data-views/${current.id}`, {
                        config: { ...current.config, hiddenFieldIds },
                      });
                      await onReload();
                    });
                  }}
                />
                {field.name}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="muted">{t("tables.noForm")}</p>
      )}
      {allowed.create ? (
        <NewFormForm
          tableId={detail.table.id}
          fields={detail.fields}
          canShare={allowed.share}
          busy={busy}
          onReload={onReload}
          onRun={onRun}
          onCreated={setFormId}
        />
      ) : null}
      {current && allowed.create ? (
        <RowForm
          key={`${current.id}-${detail.rows.length}`}
          fields={visible}
          people={detail.people}
          busy={busy}
          onSubmit={(cells, assigneeId) =>
            onRun(async () => {
              await sendJson(`/api/workspace/data-tables/${detail.table.id}/rows`, { cells, assigneeId });
              await onReload();
              const label = rowLabel(visible, cells);
              onNotice(t("tables.rowAdded"), {
                body: `${label ? `${quoted(label)} ` : ""}${t("tables.inTable")} ${quoted(detail.table.name)}`,
                detail: {
                  facts: [
                    { label: t("tables.factTable"), value: detail.table.name },
                    { label: t("tables.factForm"), value: current.name },
                  ],
                },
              });
            })
          }
        />
      ) : null}
    </div>
  );
}

function NewFormForm({
  tableId,
  fields,
  canShare,
  busy,
  onReload,
  onRun,
  onCreated,
}: {
  tableId: string;
  fields: Field[];
  canShare: boolean;
  busy: boolean;
  onReload: () => Promise<void>;
  onRun: (action: () => Promise<void>) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(() => fields.map((field) => field.id));
  const [shared, setShared] = useState(canShare);
  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        onRun(async () => {
          const created = await sendJson<{ id: string }>(`/api/workspace/data-tables/${tableId}/views`, {
            name,
            kind: "form",
            shared,
          });
          const hiddenFieldIds = fields.filter((field) => !picked.includes(field.id)).map((field) => field.id);
          if (hiddenFieldIds.length > 0) {
            await sendJson(`/api/workspace/data-views/${created.id}`, {
              config: { ...emptyViewConfig(), hiddenFieldIds },
            });
          }
          setName("");
          await onReload();
          onCreated(created.id);
        });
      }}
    >
      <label>
        {t("tables.viewName")}
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder={t("tables.form")} />
      </label>
      <p className="muted">{t("tables.formFields")}</p>
      {fields.map((field) => (
        <label className="check-line" key={field.id}>
          <input
            type="checkbox"
            checked={picked.includes(field.id)}
            onChange={() =>
              setPicked((current) =>
                current.includes(field.id) ? current.filter((id) => id !== field.id) : [...current, field.id],
              )
            }
          />
          {field.name}
        </label>
      ))}
      {canShare ? (
        <label className="check-line">
          <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
          {t("tables.shared")}
        </label>
      ) : null}
      <button type="submit" disabled={busy || picked.length === 0}>
        {t("tables.createForm")}
      </button>
    </form>
  );
}

function blankRows(fields: Field[], count: number) {
  return Array.from({ length: count }, () => defaultCells(fields));
}

function defaultCells(fields: Field[]) {
  const cells: Record<string, string> = {};
  for (const field of fields) {
    if (field.defaultValue) {
      cells[field.id] = field.defaultValue;
    }
  }
  return cells;
}

function ValueControl({
  field,
  value,
  disabled,
  onChange,
  onBlur,
}: {
  field: Field;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
}) {
  if (field.fieldType === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === "true"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked ? "true" : "")}
      />
    );
  }
  if (field.fieldType === "select") {
    return (
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("tables.none")}</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.fieldType === "uuid") {
    const code = field.format === "code";
    const length = clampIdLength(field.length ?? idLengthDefault);
    return (
      <span className="inline-value">
        <input
          value={value}
          disabled={disabled}
          maxLength={code ? length : 36}
          placeholder={code ? `${length} ${t("tables.idChars")}` : "UUID"}
          spellCheck={false}
          onChange={(event) => onChange(code ? event.target.value.toUpperCase() : event.target.value)}
          onBlur={(event) => onBlur?.(event.currentTarget.value)}
        />
        <button
          className="ghost"
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = code ? generateIdentifier(length) : crypto.randomUUID();
            onChange(next);
            onBlur?.(next);
          }}
        >
          {t("tables.generate")}
        </button>
      </span>
    );
  }
  if (field.format === "long" || field.fieldType === "json") {
    return (
      <textarea
        value={value}
        disabled={disabled}
        rows={field.fieldType === "json" ? 4 : 3}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur?.(event.currentTarget.value)}
      />
    );
  }
  const inputType =
    field.format === "email"
      ? "email"
      : field.format === "phone"
        ? "tel"
        : field.format === "url"
          ? "url"
          : field.format === "datetime"
            ? "datetime-local"
            : field.fieldType === "date"
              ? "date"
              : "text";
  return (
    <input
      type={inputType}
      inputMode={field.fieldType === "number" ? "decimal" : undefined}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onBlur?.(event.currentTarget.value)}
    />
  );
}

function Kanban({
  detail,
  rows,
  config,
  onConfig,
}: {
  detail: Detail;
  rows: DataRow[];
  config: ViewConfig;
  onConfig: (config: ViewConfig) => void;
}) {
  const selects = detail.fields.filter((field) => field.fieldType === "select");
  const field = selects.find((item) => item.id === config.kanbanFieldId) ?? selects[0];
  const groups = field ? ["", ...field.options] : [""];
  return (
    <div className="stack">
      <label>
        {t("tables.groupBy")}
        <select
          value={field?.id ?? ""}
          onChange={(event) => onConfig({ ...config, kanbanFieldId: event.target.value || null })}
        >
          <option value="">{t("tables.none")}</option>
          {selects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="kanban">
        {groups.map((group) => (
          <section className="kanban-col" key={group || "empty"}>
            <strong>{group || t("tables.unassigned")}</strong>
            {rows
              .filter((row) => (field ? (row.cells[field.id] ?? "") === group : true))
              .map((row) => (
                <article className="panel" key={row.id}>
                  {detail.fields.map((item) => (
                    <p key={item.id}>
                      <span className="muted">{item.name}: </span>
                      {item.fieldType === "checkbox" ? (row.cells[item.id] === "true" ? t("tables.checkbox") : "") : row.cells[item.id]}
                    </p>
                  ))}
                </article>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Calendar({
  detail,
  rows,
  config,
  onConfig,
}: {
  detail: Detail;
  rows: DataRow[];
  config: ViewConfig;
  onConfig: (config: ViewConfig) => void;
}) {
  const dates = detail.fields.filter((field) => field.fieldType === "date");
  const field = dates.find((item) => item.id === config.calendarFieldId) ?? dates[0];
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const first = new Date(cursor.year, cursor.month, 1);
  const pad = (first.getDay() + 6) % 7;
  const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<number | null> = [...Array.from({ length: pad }, () => null)];
  for (let day = 1; day <= count; day += 1) {
    cells.push(day);
  }
  return (
    <div className="stack">
      <label>
        {t("tables.dateField")}
        <select
          value={field?.id ?? ""}
          onChange={(event) => onConfig({ ...config, calendarFieldId: event.target.value || null })}
        >
          <option value="">{t("tables.none")}</option>
          {dates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button
          className="ghost"
          type="button"
          onClick={() =>
            setCursor((current) =>
              current.month === 0
                ? { year: current.year - 1, month: 11 }
                : { year: current.year, month: current.month - 1 },
            )
          }
        >
          {t("tables.back")}
        </button>
        <strong>
          {months[cursor.month]} {cursor.year}
        </strong>
        <button
          className="ghost"
          type="button"
          onClick={() =>
            setCursor((current) =>
              current.month === 11
                ? { year: current.year + 1, month: 0 }
                : { year: current.year, month: current.month + 1 },
            )
          }
        >
          {t("tables.open")}
        </button>
      </div>
      <div className="calendar-scroll">
        <div className="calendar-grid">
          {["lu", "ma", "mi", "ju", "vi", "sá", "do"].map((day) => (
            <strong key={day}>{day}</strong>
          ))}
          {cells.map((day, index) => {
            const key = day ? dateKey(cursor.year, cursor.month, day) : "";
            const matches = field ? rows.filter((row) => (row.cells[field.id] ?? "").slice(0, 10) === key) : [];
            return (
              <div className="calendar-day" key={`${key}-${index}`}>
                <span>{day ?? ""}</span>
                {matches.map((row) => (
                  <p key={row.id}>{detail.fields[0] ? row.cells[detail.fields[0].id] : ""}</p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RowForm({
  fields,
  people,
  busy,
  onSubmit,
}: {
  fields: Field[];
  people: Person[];
  busy: boolean;
  onSubmit: (cells: Record<string, string>, assigneeId: string | null) => void;
}) {
  const [cells, setCells] = useState<Record<string, string>>(() => defaultCells(fields));
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="panel stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (!rowHasContent(cells)) {
          setError(t("tables.emptyRow"));
          return;
        }
        setError("");
        onSubmit(cells, assigneeId || null);
        setCells(defaultCells(fields));
        setAssigneeId("");
      }}
    >
      {error ? <p className="error">{error}</p> : null}
      {fields.map((field) => (
        <label key={field.id}>
          <span>
            {field.name}
            {field.required ? " *" : ""}
          </span>
          {field.description ? <span className="muted">{field.description}</span> : null}
          <ValueControl
            field={field}
            value={cells[field.id] ?? ""}
            disabled={busy}
            onChange={(next) => setCells({ ...cells, [field.id]: next })}
          />
        </label>
      ))}
      <label>
        {t("tables.assignee")}
        <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">{t("tables.unassigned")}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy}>
        {t("tables.addRow")}
      </button>
    </form>
  );
}

function rowHasContent(cells: Record<string, string>) {
  return Object.values(cells).some((value) => value.trim() !== "");
}

function applyView(rows: DataRow[], config: ViewConfig) {
  const filtered = rows.filter((row) =>
    config.filters.every((filter) => {
      if (!filter.fieldId || !filter.value.trim()) {
        return true;
      }
      return (row.cells[filter.fieldId] ?? "").toLowerCase().includes(filter.value.trim().toLowerCase());
    }),
  );
  if (!config.sortFieldId) {
    return filtered;
  }
  const direction = config.sortDirection === "desc" ? -1 : 1;
  return [...filtered].sort(
    (left, right) =>
      (left.cells[config.sortFieldId ?? ""] ?? "").localeCompare(right.cells[config.sortFieldId ?? ""] ?? "", "es", {
        numeric: true,
      }) * direction,
  );
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const motionMs = 200;
const rowEnterMs = 300;
const rowStepMs = 16;
const rowStaggerMax = 36;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sendJson<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await api(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function readError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      return body.message.join(" ");
    }
    if (body.message) {
      return body.message;
    }
  } catch {
    return text || t("api.invalidBody");
  }
  return text || t("api.invalidBody");
}

async function download(tableId: string, format: "csv" | "xlsx") {
  const file = await sendJson<{ filename: string; mime: string; contentBase64: string }>(
    `/api/workspace/data-tables/${tableId}/export`,
    { format },
  );
  const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function detectImportFormat(file: File, bytes: Uint8Array): "csv" | "xlsx" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
    return "xlsx";
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || file.type.includes("spreadsheetml")) {
    return "xlsx";
  }
  if (name.endsWith(".csv") || file.type === "text/csv" || file.type === "application/csv") {
    return "csv";
  }
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "xlsx";
  }
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return "xlsx";
  }
  return "csv";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}
