import type { AccountKind } from "@wanted/shared";

export type Actor = {
  userId: string;
  kind: AccountKind;
  parentId: string | null;
  name: string;
  email: string;
  image: string | null;
};

export function toActor(row: {
  id: string;
  kind: AccountKind;
  parentId: string | null;
  name: string;
  email: string;
  image?: string | null;
}): Actor | null {
  const image = row.image ?? null;
  if (row.kind === "admin") {
    return { userId: row.id, kind: "admin", parentId: null, name: row.name, email: row.email, image };
  }
  if (row.kind === "parent") {
    return { userId: row.id, kind: "parent", parentId: row.id, name: row.name, email: row.email, image };
  }
  if (row.kind === "child" && row.parentId) {
    return {
      userId: row.id,
      kind: "child",
      parentId: row.parentId,
      name: row.name,
      email: row.email,
      image,
    };
  }
  return null;
}
