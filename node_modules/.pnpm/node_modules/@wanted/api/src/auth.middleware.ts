import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { AUTH } from "./tokens.ts";

type AuthHandler = Parameters<typeof toNodeHandler>[0];

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(AUTH) auth: AuthHandler) {
    this.handler = toNodeHandler(auth);
  }

  use(request: Request, response: Response, next: NextFunction) {
    if (!requestPath(request).startsWith("/api/auth")) {
      next();
      return;
    }
    void this.handler(request, response);
  }
}

export function requestPath(request: Request) {
  return (request.originalUrl ?? request.url).split("?")[0] ?? "";
}
