import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { user, type Database } from "@wanted/db";
import { readMemberPermissions, t } from "@wanted/shared";
import { type Actor } from "./actor.ts";
import { AdminGuard, SessionGuard, WorkspaceGuard, type ActorRequest } from "./guards.ts";
import { MembersService } from "./members.service.ts";
import { PlatformService } from "./platform.service.ts";
import { DB } from "./tokens.ts";

@Controller("api")
export class ApiController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Get("health")
  health() {
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() request: ActorRequest) {
    return publicActor(request.actor!);
  }

  @Get("platform/parents")
  @UseGuards(AdminGuard)
  listParents() {
    return this.platform.listParents();
  }

  @Post("platform/parents")
  @UseGuards(AdminGuard)
  createParent(@Body() body: unknown) {
    return this.platform.createParent(readParentDraft(body));
  }

  @Post("platform/parents/:id/suspend")
  @UseGuards(AdminGuard)
  suspendParent(@Param("id") id: string) {
    return this.platform.setParentStatus(id, "suspended");
  }

  @Post("platform/parents/:id/activate")
  @UseGuards(AdminGuard)
  activateParent(@Param("id") id: string) {
    return this.platform.setParentStatus(id, "active");
  }

  @Post("platform/parents/:id/access")
  @UseGuards(AdminGuard)
  resetAccess(@Param("id") id: string, @Body() body: unknown) {
    return this.platform.resetParentAccess(id, readPassword(body));
  }

  @Get("workspace")
  @UseGuards(WorkspaceGuard)
  async workspace(@Req() request: ActorRequest) {
    const actor = request.actor!;
    const parentId = actor.parentId;
    if (!parentId) {
      throw new ForbiddenException(t("api.forbidden"));
    }
    const [parent] = await this.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(eq(user.id, parentId), eq(user.kind, "parent")))
      .limit(1);

    const access = await this.members.describe(actor);
    return {
      parentId,
      parentName: parent?.name ?? "",
      parentEmail: parent?.email ?? "",
      actor: publicActor(actor),
      grants: access.grants,
      manageSets: access.manageSets,
    };
  }

  @Get("workspace/members")
  @UseGuards(WorkspaceGuard)
  listMembers(@Req() request: ActorRequest) {
    return this.members.listMembers(request.actor!);
  }

  @Get("workspace/members/access-options")
  @UseGuards(WorkspaceGuard)
  accessOptions(@Req() request: ActorRequest) {
    return this.members.accessOptions(request.actor!);
  }

  @Post("workspace/members")
  @UseGuards(WorkspaceGuard)
  createMember(@Req() request: ActorRequest, @Body() body: unknown) {
    const record = asRecord(body);
    const name = readString(record, "name");
    const email = readString(record, "email");
    const password = readString(record, "password");
    const permissions = readMemberPermissions(record.permissions);
    if (!name || !email || !password || !permissions) {
      throw new BadRequestException(t("api.invalidBody"));
    }
    return this.members.createChild(request.actor!, { name, email, password, permissions });
  }

  @Post("workspace/members/:id")
  @UseGuards(WorkspaceGuard)
  updateMember(@Req() request: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    const record = asRecord(body);
    const name = readString(record, "name");
    const email = readString(record, "email");
    const permissions = readMemberPermissions(record.permissions);
    if (!name || !email || !permissions) {
      throw new BadRequestException(t("api.invalidBody"));
    }
    return this.members.updateChild(request.actor!, id, {
      name,
      email,
      permissions,
      password: readString(record, "password"),
    });
  }

  @Post("workspace/members/:id/suspend")
  @UseGuards(WorkspaceGuard)
  suspendMember(@Req() request: ActorRequest, @Param("id") id: string) {
    return this.members.setChildStatus(request.actor!, id, "suspended");
  }

  @Post("workspace/members/:id/activate")
  @UseGuards(WorkspaceGuard)
  activateMember(@Req() request: ActorRequest, @Param("id") id: string) {
    return this.members.setChildStatus(request.actor!, id, "active");
  }

  @Post("workspace/members/:id/access")
  @UseGuards(WorkspaceGuard)
  resetMemberAccess(@Req() request: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.members.resetChildAccess(request.actor!, id, readPassword(body));
  }

}

function publicActor(actor: Actor) {
  return {
    id: actor.userId,
    kind: actor.kind,
    name: actor.name,
    email: actor.email,
    image: actor.image,
  };
}

function readParentDraft(body: unknown) {
  const record = asRecord(body);
  const name = readString(record, "name");
  const email = readString(record, "email");
  const password = readString(record, "password");
  if (!name || !email || !password) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return { name, email, password };
}

function readPassword(body: unknown) {
  const password = readString(asRecord(body), "password");
  if (!password) {
    throw new BadRequestException(t("api.invalidBody"));
  }
  return password;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    return {};
  }
  return body as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}
