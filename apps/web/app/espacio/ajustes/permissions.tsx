"use client";

import { useState } from "react";
import {
  memberLevelRank,
  memberLevels,
  t,
  viewOnlyCaps,
  type AccessRule,
  type MemberLevel,
  type MemberPermissions,
  type PermissionScope,
  type SectionKey,
  type TableCaps,
} from "@wanted/shared";

export type AccessOptions = {
  sections: SectionKey[];
  members: MemberLevel;
  all: TableCaps | null;
  bases: Array<{
    id: string;
    name: string;
    caps: TableCaps | null;
    tables: Array<{ id: string; name: string; caps: TableCaps | null }>;
  }>;
};

type BaseDraft = { mode: "none" | "all" | "pick"; caps: TableCaps; tables: Record<string, TableCaps> };

export type PermissionDraft = {
  sections: SectionKey[];
  members: MemberLevel;
  tablesMode: "all" | "pick";
  allCaps: TableCaps;
  bases: Record<string, BaseDraft>;
};

type CapFlag = "createRows" | "editRows" | "deleteRows" | "export" | "manage" | "createTables" | "manageSets";

const flagLabel: Record<CapFlag, Parameters<typeof t>[0]> = {
  createRows: "settings.capCreateRows",
  editRows: "settings.capEditRows",
  deleteRows: "settings.capDeleteRows",
  export: "settings.capExport",
  manage: "settings.capManage",
  createTables: "settings.capCreateTables",
  manageSets: "settings.capManageSets",
};

const scopeRank: Record<PermissionScope, number> = { assigned: 0, own: 1, all: 2 };
const scopeOrder: PermissionScope[] = ["all", "own", "assigned"];
const scopeLabel: Record<PermissionScope, Parameters<typeof t>[0]> = {
  all: "settings.rowsAll",
  own: "settings.rowsOwn",
  assigned: "settings.rowsAssigned",
};

const sectionLabel: Record<SectionKey, Parameters<typeof t>[0]> = {
  tables: "modules.tables",
  crm: "modules.crm",
  inbox: "modules.inbox",
  automations: "modules.automations",
};

const levelLabel: Record<MemberLevel, Parameters<typeof t>[0]> = {
  none: "settings.membersNone",
  view: "settings.membersView",
  create: "settings.membersCreate",
  manage: "settings.membersManage",
};

function clampCaps(caps: TableCaps, max: TableCaps | null, flags: readonly CapFlag[]): TableCaps {
  const next: TableCaps = { ...viewOnlyCaps, rowScope: caps.rowScope };
  for (const flag of flags) {
    next[flag] = Boolean(caps[flag] && max?.[flag]);
  }
  if (max && scopeRank[next.rowScope] > scopeRank[max.rowScope]) {
    next.rowScope = max.rowScope;
  }
  return next;
}

function startCaps(max: TableCaps | null): TableCaps {
  return { ...viewOnlyCaps, rowScope: max?.rowScope ?? "all" };
}

export function emptyDraft(): PermissionDraft {
  return { sections: [], members: "none", tablesMode: "pick", allCaps: { ...viewOnlyCaps }, bases: {} };
}

export function draftFromPermissions(permissions: MemberPermissions): PermissionDraft {
  const draft = emptyDraft();
  draft.sections = [...permissions.sections];
  draft.members = permissions.members;
  const all = permissions.tables.find((rule) => rule.target === "all");
  if (all) {
    draft.tablesMode = "all";
    draft.allCaps = { ...all };
  }
  for (const rule of permissions.tables) {
    if (rule.target === "base") {
      draft.bases[rule.targetId] = { mode: "all", caps: { ...rule }, tables: {} };
    }
  }
  return draft;
}

// Las reglas de tabla necesitan saber a qué conjunto pertenece cada tabla.
export function attachTables(draft: PermissionDraft, permissions: MemberPermissions, options: AccessOptions) {
  const next = { ...draft, bases: { ...draft.bases } };
  for (const rule of permissions.tables.filter((item) => item.target === "table")) {
    const base = options.bases.find((item) => item.tables.some((table) => table.id === rule.targetId));
    if (!base) {
      continue;
    }
    const current = next.bases[base.id] ?? { mode: "pick", caps: startCaps(base.caps), tables: {} };
    next.bases[base.id] = {
      ...current,
      mode: current.mode === "all" ? "all" : "pick",
      tables: { ...current.tables, [rule.targetId]: { ...rule } },
    };
  }
  return next;
}

export function permissionsFromDraft(draft: PermissionDraft): MemberPermissions {
  const tables: AccessRule[] = [];
  if (draft.sections.includes("tables")) {
    if (draft.tablesMode === "all") {
      tables.push({ target: "all", targetId: "", ...draft.allCaps });
    } else {
      for (const [baseId, base] of Object.entries(draft.bases)) {
        if (base.mode === "all") {
          tables.push({ target: "base", targetId: baseId, ...base.caps, manageSets: false });
        }
        if (base.mode === "pick") {
          for (const [tableId, caps] of Object.entries(base.tables)) {
            tables.push({ target: "table", targetId: tableId, ...caps, createTables: false, manageSets: false });
          }
        }
      }
    }
  }
  return { sections: draft.sections, members: draft.members, tables };
}

export function summary(permissions: MemberPermissions) {
  const parts: string[] = [];
  if (permissions.sections.includes("tables")) {
    const all = permissions.tables.some((rule) => rule.target === "all");
    const count = permissions.tables.length;
    parts.push(
      all
        ? t("settings.summaryAllSets")
        : count === 0
          ? t("settings.summaryNoTables")
          : `${count} ${count === 1 ? t("settings.summaryRule") : t("settings.summaryRules")}`,
    );
  }
  if (permissions.members !== "none") {
    parts.push(`${t("settings.summaryMembers")}: ${t(levelLabel[permissions.members]).toLowerCase()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : t("settings.summaryNone");
}

export function PermissionEditor({
  draft,
  options,
  onChange,
}: {
  draft: PermissionDraft;
  options: AccessOptions | null;
  onChange: (next: PermissionDraft) => void;
}) {
  const [openBase, setOpenBase] = useState<string | null>(null);
  const [openTable, setOpenTable] = useState<string | null>(null);

  if (!options) {
    return <p className="muted settings-loading">{t("tables.loading")}</p>;
  }

  const tablesOn = draft.sections.includes("tables");

  function toggleSection(key: SectionKey) {
    const on = draft.sections.includes(key);
    onChange({ ...draft, sections: on ? draft.sections.filter((item) => item !== key) : [...draft.sections, key] });
  }

  function setBase(baseId: string, next: BaseDraft) {
    onChange({ ...draft, bases: { ...draft.bases, [baseId]: next } });
  }

  return (
    <div className="perm">
      <div className="settings-group">
        <p className="settings-group-label">{t("settings.sections")}</p>
        <div className="perm-list">
          {(["tables", "crm", "inbox", "automations"] as const).map((key) => {
            const allowed = options.sections.includes(key);
            const on = draft.sections.includes(key);
            return (
              <div className="perm-row" key={key}>
                <span className="perm-row-name">
                  {t(sectionLabel[key])}
                  {key !== "tables" ? <span className="perm-soon">{t("settings.soon")}</span> : null}
                </span>
                <Switch
                  checked={on}
                  disabled={!allowed && !on}
                  label={t(sectionLabel[key])}
                  onChange={() => toggleSection(key)}
                />
              </div>
            );
          })}
          <div className="perm-row">
            <span className="perm-row-name">{t("members.title")}</span>
            <div className="segmented is-small" role="radiogroup" aria-label={t("members.title")}>
              {memberLevels.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={draft.members === level}
                  className={draft.members === level ? "is-on" : undefined}
                  disabled={memberLevelRank(level) > memberLevelRank(options.members)}
                  onClick={() => onChange({ ...draft, members: level })}
                >
                  {t(levelLabel[level])}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tablesOn ? (
        <div className="settings-group">
          <p className="settings-group-label">{t("settings.tablesAccess")}</p>
          <div className="segmented" role="radiogroup" aria-label={t("settings.tablesAccess")}>
            <button
              type="button"
              role="radio"
              aria-checked={draft.tablesMode === "all"}
              className={draft.tablesMode === "all" ? "is-on" : undefined}
              disabled={!options.all}
              onClick={() =>
                onChange({
                  ...draft,
                  tablesMode: "all",
                  allCaps: clampCaps(draft.allCaps, options.all, ["createRows", "editRows", "deleteRows", "export", "manage", "createTables", "manageSets"]),
                })
              }
            >
              {t("settings.allSets")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.tablesMode === "pick"}
              className={draft.tablesMode === "pick" ? "is-on" : undefined}
              onClick={() => onChange({ ...draft, tablesMode: "pick" })}
            >
              {t("settings.pickSets")}
            </button>
          </div>

          {draft.tablesMode === "all" ? (
            <div className="perm-card">
              <p className="perm-hint">{t("settings.allSetsHint")}</p>
              <CapsEditor
                caps={draft.allCaps}
                max={options.all}
                flags={["createRows", "editRows", "deleteRows", "export", "manage", "createTables", "manageSets"]}
                onChange={(caps) => onChange({ ...draft, allCaps: caps })}
              />
            </div>
          ) : options.bases.length === 0 ? (
            <p className="perm-hint">{t("settings.noSets")}</p>
          ) : (
            <div className="perm-sets">
              {options.bases.map((base) => {
                const current = draft.bases[base.id] ?? { mode: "none" as const, caps: startCaps(base.caps), tables: {} };
                const open = openBase === base.id;
                const picked = Object.keys(current.tables).length;
                const status =
                  current.mode === "all"
                    ? t("settings.setAllTables")
                    : current.mode === "pick"
                      ? `${picked} ${picked === 1 ? t("tables.tableOne") : t("tables.setTablesMany")}`
                      : t("settings.noAccess");
                return (
                  <div className={open ? "perm-set is-open" : "perm-set"} key={base.id}>
                    <button
                      type="button"
                      className="perm-set-head"
                      aria-expanded={open}
                      onClick={() => setOpenBase(open ? null : base.id)}
                    >
                      <span className={current.mode === "none" ? "perm-dot" : "perm-dot is-on"} aria-hidden="true" />
                      <span className="perm-set-name">{base.name}</span>
                      <span className="perm-set-status">{status}</span>
                      <ChevronIcon />
                    </button>
                    {open ? (
                      <div className="perm-set-body">
                        <div className="segmented is-small" role="radiogroup" aria-label={base.name}>
                          {(["none", "all", "pick"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              role="radio"
                              aria-checked={current.mode === mode}
                              className={current.mode === mode ? "is-on" : undefined}
                              disabled={mode === "all" && !base.caps}
                              onClick={() =>
                                setBase(base.id, {
                                  ...current,
                                  mode,
                                  caps: clampCaps(current.caps, base.caps, ["createRows", "editRows", "deleteRows", "export", "manage", "createTables"]),
                                })
                              }
                            >
                              {mode === "none"
                                ? t("settings.noAccess")
                                : mode === "all"
                                  ? t("settings.setAllTables")
                                  : t("settings.pickTables")}
                            </button>
                          ))}
                        </div>

                        {current.mode === "all" ? (
                          <CapsEditor
                            caps={current.caps}
                            max={base.caps}
                            flags={["createRows", "editRows", "deleteRows", "export", "manage", "createTables"]}
                            onChange={(caps) => setBase(base.id, { ...current, caps })}
                          />
                        ) : null}

                        {current.mode === "pick" ? (
                          base.tables.length === 0 ? (
                            <p className="perm-hint">{t("tables.emptySetTables")}</p>
                          ) : (
                            <ul className="perm-tables">
                              {base.tables.map((table) => {
                                const caps = current.tables[table.id];
                                const on = Boolean(caps);
                                const tableOpen = openTable === table.id;
                                return (
                                  <li key={table.id} className={on ? "perm-table is-on" : "perm-table"}>
                                    <div className="perm-table-head">
                                      <label className="perm-check">
                                        <input
                                          type="checkbox"
                                          checked={on}
                                          onChange={() => {
                                            const tables = { ...current.tables };
                                            if (on) {
                                              delete tables[table.id];
                                            } else {
                                              tables[table.id] = startCaps(table.caps);
                                            }
                                            setBase(base.id, { ...current, tables });
                                            setOpenTable(on ? null : table.id);
                                          }}
                                        />
                                        <span>{table.name}</span>
                                      </label>
                                      {on ? (
                                        <button
                                          type="button"
                                          className="perm-table-toggle"
                                          aria-expanded={tableOpen}
                                          onClick={() => setOpenTable(tableOpen ? null : table.id)}
                                        >
                                          {capsSummary(caps)}
                                          <ChevronIcon />
                                        </button>
                                      ) : null}
                                    </div>
                                    {on && tableOpen ? (
                                      <CapsEditor
                                        caps={caps}
                                        max={table.caps}
                                        flags={["createRows", "editRows", "deleteRows", "export", "manage"]}
                                        onChange={(next) =>
                                          setBase(base.id, { ...current, tables: { ...current.tables, [table.id]: next } })
                                        }
                                      />
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function capsSummary(caps: TableCaps) {
  const count = (["createRows", "editRows", "deleteRows", "export", "manage"] as const).filter((flag) => caps[flag]).length;
  return count === 0 ? t("settings.onlyView") : `${t("settings.view")} + ${count}`;
}

function CapsEditor({
  caps,
  max,
  flags,
  onChange,
}: {
  caps: TableCaps;
  max: TableCaps | null;
  flags: readonly CapFlag[];
  onChange: (next: TableCaps) => void;
}) {
  return (
    <div className="caps">
      <div className="caps-chips">
        <span className="caps-chip is-fixed">{t("settings.view")}</span>
        {flags.map((flag) => (
          <button
            key={flag}
            type="button"
            className={caps[flag] ? "caps-chip is-on" : "caps-chip"}
            aria-pressed={caps[flag]}
            disabled={!max?.[flag]}
            onClick={() => onChange({ ...caps, [flag]: !caps[flag] })}
          >
            {t(flagLabel[flag])}
          </button>
        ))}
      </div>
      <div className="caps-scope">
        <span>{t("settings.rowsVisible")}</span>
        <div className="segmented is-small" role="radiogroup" aria-label={t("settings.rowsVisible")}>
          {scopeOrder.map((scope) => (
            <button
              key={scope}
              type="button"
              role="radio"
              aria-checked={caps.rowScope === scope}
              className={caps.rowScope === scope ? "is-on" : undefined}
              disabled={Boolean(max) && scopeRank[scope] > scopeRank[max!.rowScope]}
              onClick={() => onChange({ ...caps, rowScope: scope })}
            >
              {t(scopeLabel[scope])}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? "switch is-on" : "switch"}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="switch-knob" />
    </button>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
