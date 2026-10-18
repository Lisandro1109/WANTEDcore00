import { readAdminSeedInput, seedAdmin } from "./seed-admin.ts";
import { createDb } from "./client.ts";
import { t } from "@wanted/shared";

const { client, db } = createDb();

try {
  const result = await seedAdmin(db, readAdminSeedInput());
  console.log(result.created ? t("seed.created") : t("seed.alreadyExists"));
} finally {
  await client.end();
}
