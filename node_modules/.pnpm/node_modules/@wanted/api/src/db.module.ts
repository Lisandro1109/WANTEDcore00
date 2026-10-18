import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createAuth, createDb } from "@wanted/db";
import { t } from "@wanted/shared";
import { AUTH, DB, DB_CLIENT } from "./tokens.ts";

const CONNECTION = Symbol("CONNECTION");
type Connection = ReturnType<typeof createDb>;

@Injectable()
class CloseDatabase implements OnApplicationShutdown {
  constructor(@Inject(DB_CLIENT) private readonly client: Connection["client"]) {}

  async onApplicationShutdown() {
    await this.client.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: CONNECTION,
      useFactory: () => createDb(),
    },
    {
      provide: DB,
      inject: [CONNECTION],
      useFactory: (connection: Connection) => connection.db,
    },
    {
      provide: DB_CLIENT,
      inject: [CONNECTION],
      useFactory: (connection: Connection) => connection.client,
    },
    {
      provide: AUTH,
      inject: [DB],
      useFactory: (db: Connection["db"]) => {
        const secret = process.env.BETTER_AUTH_SECRET ?? "";
        const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
        const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
        if (secret.length < 16) {
          throw new Error(t("api.missingSecret"));
        }
        return createAuth(db, {
          secret,
          baseURL,
          trustedOrigins: [webOrigin, baseURL],
        });
      },
    },
    CloseDatabase,
  ],
  exports: [DB, AUTH],
})
export class DbModule {}
