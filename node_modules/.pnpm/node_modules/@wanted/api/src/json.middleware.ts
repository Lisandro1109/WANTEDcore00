import { Injectable, type NestMiddleware } from "@nestjs/common";
import express, { type NextFunction, type Request, type Response } from "express";
import { requestPath } from "./auth.middleware.ts";

const json = express.json({ limit: "32mb" });

@Injectable()
export class JsonMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    if (requestPath(request).startsWith("/api/auth")) {
      next();
      return;
    }
    json(request, response, next);
  }
}
