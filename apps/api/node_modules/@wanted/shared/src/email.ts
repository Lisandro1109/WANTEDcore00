export const accountEmailDomain = "wanted.com";

const localPattern = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export function accountEmailLocal(value: string): string {
  const raw = value.trim().toLowerCase();
  const at = raw.indexOf("@");
  return at === -1 ? raw : raw.slice(0, at);
}

export function toAccountEmail(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw || raw.split("@").length > 2) {
    return null;
  }
  const at = raw.indexOf("@");
  const local = at === -1 ? raw : raw.slice(0, at);
  const domain = at === -1 ? accountEmailDomain : raw.slice(at + 1);
  if (domain !== accountEmailDomain || !localPattern.test(local)) {
    return null;
  }
  return `${local}@${accountEmailDomain}`;
}
