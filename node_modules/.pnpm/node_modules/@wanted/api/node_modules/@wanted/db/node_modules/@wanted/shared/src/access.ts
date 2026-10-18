import type { PermissionGrant, PermissionScope } from "./permissions.ts";

// Secciones que se activan por usuario hijo. CRM, Bandeja y Automatizaciones quedan guardadas para cuando lleguen.
export const sectionKeys = ["tables", "crm", "inbox", "automations"] as const;
export type SectionKey = (typeof sectionKeys)[number];

export const memberLevels = ["none", "view", "create", "manage"] as const;
export type MemberLevel = (typeof memberLevels)[number];

export const accessTargets = ["all", "base", "table"] as const;
export type AccessTarget = (typeof accessTargets)[number];

export type TableCaps = {
  createRows: boolean;
  editRows: boolean;
  deleteRows: boolean;
  export: boolean;
  manage: boolean;
  createTables: boolean;
  manageSets: boolean;
  rowScope: PermissionScope;
};

export type AccessRule = TableCaps & {
  target: AccessTarget;
  targetId: string;
};

export type MemberPermissions = {
  sections: SectionKey[];
  members: MemberLevel;
  tables: AccessRule[];
};

export const fullCaps: TableCaps = {
  createRows: true,
  editRows: true,
  deleteRows: true,
  export: true,
  manage: true,
  createTables: true,
  manageSets: true,
  rowScope: "all",
};

export const viewOnlyCaps: TableCaps = {
  createRows: false,
  editRows: false,
  deleteRows: false,
  export: false,
  manage: false,
  createTables: false,
  manageSets: false,
  rowScope: "all",
};

const capFlags = ["createRows", "editRows", "deleteRows", "export", "manage", "createTables", "manageSets"] as const;
const scopeRank: Record<PermissionScope, number> = { assigned: 0, own: 1, all: 2 };

// Solo "Todos los conjuntos" puede administrar conjuntos y solo un conjunto o "todos" puede crear tablas.
export function normalizeCaps(target: AccessTarget, caps: TableCaps): TableCaps {
  return {
    ...caps,
    createTables: target === "table" ? false : caps.createTables,
    manageSets: target === "all" ? caps.manageSets : false,
  };
}

export function ruleFor(rules: readonly AccessRule[], target: AccessTarget, targetId = "") {
  return rules.find((rule) => rule.target === target && rule.targetId === (target === "all" ? "" : targetId)) ?? null;
}

// La regla más específica gana: tabla, después conjunto, después todos los conjuntos.
export function capsForTable(rules: readonly AccessRule[], baseId: string, tableId: string): TableCaps | null {
  return ruleFor(rules, "table", tableId) ?? ruleFor(rules, "base", baseId) ?? ruleFor(rules, "all") ?? null;
}

export function capsForBase(rules: readonly AccessRule[], baseId: string): TableCaps | null {
  return ruleFor(rules, "base", baseId) ?? ruleFor(rules, "all") ?? null;
}

export function capsCover(have: TableCaps, want: TableCaps) {
  return capFlags.every((flag) => have[flag] || !want[flag]) && scopeRank[have.rowScope] >= scopeRank[want.rowScope];
}

export function memberLevelRank(level: MemberLevel) {
  return memberLevels.indexOf(level);
}

// Traduce las secciones a los permisos de módulo que ya usan el shell y la API.
export function grantsFromPermissions(permissions: Pick<MemberPermissions, "sections" | "members">): PermissionGrant[] {
  const grants: PermissionGrant[] = permissions.sections.map((module) => ({ module, action: "view", scope: "all" }));
  const level = memberLevelRank(permissions.members);
  if (level >= memberLevelRank("view")) {
    grants.push({ module: "members", action: "view", scope: "all" });
  }
  if (level >= memberLevelRank("create")) {
    grants.push({ module: "members", action: "create", scope: "all" });
  }
  if (level >= memberLevelRank("manage")) {
    grants.push({ module: "members", action: "manage", scope: "all" });
  }
  return grants;
}

export function permissionsFromGrants(grants: readonly PermissionGrant[]): Pick<MemberPermissions, "sections" | "members"> {
  const sections = sectionKeys.filter((key) => grants.some((grant) => grant.module === key));
  const has = (action: string) => grants.some((grant) => grant.module === "members" && grant.action === action);
  const members: MemberLevel = has("manage") ? "manage" : has("create") ? "create" : has("view") ? "view" : "none";
  return { sections, members };
}

function isScope(value: unknown): value is PermissionScope {
  return value === "all" || value === "own" || value === "assigned";
}

export function readTableCaps(value: unknown): TableCaps {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    createRows: raw.createRows === true,
    editRows: raw.editRows === true,
    deleteRows: raw.deleteRows === true,
    export: raw.export === true,
    manage: raw.manage === true,
    createTables: raw.createTables === true,
    manageSets: raw.manageSets === true,
    rowScope: isScope(raw.rowScope) ? raw.rowScope : "all",
  };
}

const idPattern = /^[A-Za-z0-9-]{1,64}$/;

export function readMemberPermissions(value: unknown): MemberPermissions | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const sections = Array.isArray(raw.sections)
    ? sectionKeys.filter((key) => (raw.sections as unknown[]).includes(key))
    : [];
  const members = memberLevels.find((level) => level === raw.members) ?? "none";
  const rules: AccessRule[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.tables)) {
    for (const item of raw.tables.slice(0, 2000)) {
      const entry = (item ?? {}) as Record<string, unknown>;
      const target = accessTargets.find((kind) => kind === entry.target);
      if (!target) {
        return null;
      }
      const targetId = target === "all" ? "" : typeof entry.targetId === "string" ? entry.targetId : "";
      if (target !== "all" && !idPattern.test(targetId)) {
        return null;
      }
      const key = `${target}:${targetId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rules.push({ target, targetId, ...normalizeCaps(target, readTableCaps(entry)) });
    }
  }
  return { sections, members, tables: sections.includes("tables") ? rules : [] };
}
