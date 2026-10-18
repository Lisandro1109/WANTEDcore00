import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { readActivityInput, t } from "@wanted/shared";
import { ActivityService } from "./activity.service.ts";
import { WorkspaceGuard, type ActorRequest } from "./guards.ts";

@Controller("api")
@UseGuards(WorkspaceGuard)
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  @Get("workspace/activity")
  list(@Req() request: ActorRequest, @Query("after") after?: string) {
    return this.activity.list(request.actor!, after);
  }

  @Post("workspace/activity")
  publish(@Req() request: ActorRequest, @Body() body: unknown) {
    const input = readActivityInput(body);
    if (!input) {
      throw new BadRequestException(t("api.invalidBody"));
    }
    return this.activity.publish(request.actor!, input);
  }

  @Post("workspace/activity/:id/restored")
  markRestored(@Req() request: ActorRequest, @Param("id") id: string) {
    return this.activity.markRestored(request.actor!, id);
  }
}
