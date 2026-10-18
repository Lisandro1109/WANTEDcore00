export const minimumPasswordLength = 8;

export const accountKinds = ["admin", "parent", "child"] as const;

export type AccountKind = (typeof accountKinds)[number];

export const accountStatuses = ["active", "suspended"] as const;

export type AccountStatus = (typeof accountStatuses)[number];

export function isAccountKind(value: string): value is AccountKind {
  return accountKinds.some((kind) => kind === value);
}

export function isAccountStatus(value: string): value is AccountStatus {
  return accountStatuses.some((status) => status === value);
}
