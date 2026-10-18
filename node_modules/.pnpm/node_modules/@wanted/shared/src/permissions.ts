export const permissionModules = ["tables", "crm", "inbox", "automations", "members", "settings"] as const;

export type PermissionModule = (typeof permissionModules)[number];

export const permissionActions = ["view", "create", "edit", "delete", "export", "share", "manage"] as const;

export type PermissionAction = (typeof permissionActions)[number];

export const permissionScopes = ["all", "own", "assigned"] as const;

export type PermissionScope = (typeof permissionScopes)[number];

export type PermissionGrant = {
  module: PermissionModule;
  action: PermissionAction;
  scope: PermissionScope;
};

export function hasGrant(
  grantsList: readonly PermissionGrant[],
  module: PermissionModule,
  action: PermissionAction,
) {
  return grantsList.some((grant) => grant.module === module && grant.action === action);
}

export function grantScope(
  grantsList: readonly PermissionGrant[],
  module: PermissionModule,
  action: PermissionAction,
): PermissionScope | null {
  return grantsList.find((grant) => grant.module === module && grant.action === action)?.scope ?? null;
}

export function isPermissionModule(value: string): value is PermissionModule {
  return permissionModules.some((module) => module === value);
}

export function isPermissionAction(value: string): value is PermissionAction {
  return permissionActions.some((action) => action === value);
}

export function isPermissionScope(value: string): value is PermissionScope {
  return permissionScopes.some((scope) => scope === value);
}
