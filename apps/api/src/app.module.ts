import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ActivityController } from "./activity.controller.ts";
import { ActivityService } from "./activity.service.ts";
import { ApiController } from "./api.controller.ts";
import { AuthMiddleware } from "./auth.middleware.ts";
import { DbModule } from "./db.module.ts";
import { JsonMiddleware } from "./json.middleware.ts";
import { MembersService } from "./members.service.ts";
import { PlatformService } from "./platform.service.ts";
import { TablesController } from "./tables.controller.ts";
import { TablesService } from "./tables.service.ts";

@Module({
  imports: [DbModule],
  controllers: [ApiController, TablesController, ActivityController],
  providers: [PlatformService, MembersService, TablesService, ActivityService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware, JsonMiddleware).forRoutes("{*path}");
  }
}
