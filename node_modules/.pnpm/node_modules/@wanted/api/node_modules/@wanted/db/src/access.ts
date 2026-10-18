import { eq } from "drizzle-orm";
import { user } from "./schema.ts";
import type { Database } from "./database.ts";

export async function canOpenSession(db: Database, userId: string): Promise<boolean> {
  const [accountUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!accountUser || accountUser.status !== "active") {
    return false;
  }

  if (accountUser.kind === "child") {
    if (!accountUser.parentId) {
      return false;
    }
    const [parent] = await db
      .select()
      .from(user)
      .where(eq(user.id, accountUser.parentId))
      .limit(1);
    return Boolean(parent && parent.kind === "parent" && parent.status === "active");
  }

  return accountUser.kind === "admin" || accountUser.kind === "parent";
}
