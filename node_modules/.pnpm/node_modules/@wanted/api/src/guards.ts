import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { canOpenSession, user, type Database } from "@wanted/db";
import { t } from "@wanted/shared";
import { eq } from "drizzle-orm";
import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { toActor, type Actor } from "./actor.ts";
import { AUTH, DB } from "./tokens.ts";

type AuthApi = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<{ user: { id: string } } | null>;
  };
};

export type ActorRequest = {
  headers: IncomingHttpHeaders;
  actor?: Actor;
};

async function readActor(auth: AuthApi, db: Database, headers: IncomingHttpHeaders): Promise<Actor> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  if (!session) {
    throw new UnauthorizedException(t("api.unauthorized"));
  }

  const [row] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!row || !(await canOpenSession(db, row.id))) {
    throw new ForbiddenException(t("auth.suspended"));
  }

  const actor = toActor(row);
  if (!actor) {
    throw new ForbiddenException(t("api.forbidden"));
  }
  return actor;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: AuthApi,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    request.actor = await readActor(this.auth, this.db, request.headers);
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: AuthApi,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const actor = await readActor(this.auth, this.db, request.headers);
    if (actor.kind !== "admin") {
      throw new ForbiddenException(t("api.forbidden"));
    }
    request.actor = actor;
    return true;
  }
}

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: AuthApi,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    const actor = await readActor(this.auth, this.db, request.headers);
    if (actor.kind === "admin" || !actor.parentId) {
      throw new ForbiddenException(t("api.forbidden"));
    }
    request.actor = actor;
    return true;
  }
}
