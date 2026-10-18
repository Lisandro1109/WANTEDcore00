import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
  app.enableCors({ origin: [webOrigin, baseURL], credentials: true });
  return app;
}
