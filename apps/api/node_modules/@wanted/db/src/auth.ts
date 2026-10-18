import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { canOpenSession } from "./access.ts";
import * as schema from "./schema.ts";

type Database = PostgresJsDatabase<typeof schema>;

export function createAuth(
  db: Database,
  options: { secret: string; baseURL: string; trustedOrigins: string[] },
) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const allowed = await canOpenSession(db, session.userId);
            if (!allowed) {
              return false;
            }
            return { data: session };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        kind: {
          type: ["admin", "parent", "child"],
          required: true,
          input: false,
        },
        parentId: {
          type: "string",
          required: false,
          input: false,
        },
        status: {
          type: ["active", "suspended"],
          required: true,
          defaultValue: "active",
          input: false,
        },
      },
    },
  });
}
