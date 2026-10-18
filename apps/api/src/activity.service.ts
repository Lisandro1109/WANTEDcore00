import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { activity, grantsForUser, type Database } from "@wanted/db";
import { grantScope, readActivityDetail, t, type ActivityInput } from "@wanted/shared";
import type { Actor } from "./actor.ts";
import { DB } from "./tokens.ts";

const keepMs = 30 * 24 * 60 * 60 * 1000;
const purgeEveryMs = 6 * 60 * 60 * 1000;
const pageMax = 50;

type ActivityRow = typeof activity.$inferSelect;

@Injectable()
export class ActivityService implements OnModuleInit, OnModuleDestroy {
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  onModuleInit() {
    const run = () => {
      this.purge().catch((error) => console.error("activity purge", error));
    };
    this.purgeTimer = setInterval(run, purgeEveryMs);
  }

  onModuleDestroy() {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
    }
  }

  async purge() {
    await this.db.delete(activity).where(lt(activity.createdAt, new Date(Date.now() - keepMs)));
  }

  async list(actor: Actor, after?: string) {
    const parentId = this.parentId(actor);
    const filters = [eq(activity.parentId, parentId)];
    if (actor.kind !== "parent") {
      filters.push(eq(activity.actorId, actor.userId));
    }
    if (after && !Number.isNaN(Date.parse(after))) {
      filters.push(gt(activity.createdAt, new Date(after)));
    }
    const rows = await this.db
      .select()
      .from(activity)
      .where(and(...filters))
      .orderBy(desc(activity.createdAt))
      .limit(pageMax);
    return rows.map(toPublic);
  }

  async publish(actor: Actor, input: ActivityInput) {
    const parentId = this.parentId(actor);
    await this.requireModule(actor, input.module);
    const [row] = await this.db
      .insert(activity)
      .values({
        id: crypto.randomUUID(),
        parentId,
        actorId: actor.userId,
        actorName: actor.name,
        module: input.module,
        title: input.title,
        body: input.body,
        tone: input.tone,
        detail: JSON.stringify(input.detail),
      })
      .returning();
    if (!row) {
      throw new NotFoundException(t("tables.notFound"));
    }
    return toPublic(row);
  }

  async markRestored(actor: Actor, id: string) {
    const parentId = this.parentId(actor);
    const filters = [eq(activity.id, id), eq(activity.parentId, parentId)];
    if (actor.kind !== "parent") {
      filters.push(eq(activity.actorId, actor.userId));
    }
    const [found] = await this.db
      .select({ id: activity.id })
      .from(activity)
      .where(and(...filters))
      .limit(1);
    if (!found) {
      throw new NotFoundException(t("tables.notFound"));
    }
    const restoredAt = new Date();
    await this.db.update(activity).set({ restoredAt }).where(eq(activity.id, found.id));
    return { id: found.id, restoredAt: restoredAt.toISOString() };
  }

  private parentId(actor: Actor) {
    if (!actor.parentId) {
      throw new ForbiddenException(t("api.forbidden"));
    }
    return actor.parentId;
  }

  private async requireModule(actor: Actor, module: ActivityInput["module"]) {
    if (actor.kind === "parent") {
      return;
    }
    const grants = await grantsForUser(this.db, actor.userId);
    if (!grantScope(grants, module, "view")) {
      throw new ForbiddenException(t("api.forbidden"));
    }
  }
}

function toPublic(row: ActivityRow) {
  let stored: unknown = {};
  try {
    stored = JSON.parse(row.detail);
  } catch {
    stored = {};
  }
  const detail = readActivityDetail(stored);
  if (row.restoredAt) {
    detail.restoredAt = row.restoredAt.toISOString();
  }
  return {
    id: row.id,
    module: row.module,
    title: row.title,
    body: row.body,
    tone: row.tone,
    detail,
    actorId: row.actorId,
    actorName: row.actorName,
    at: row.createdAt.toISOString(),
  };
}
