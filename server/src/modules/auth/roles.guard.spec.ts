import { describe, expect, it } from "@jest/globals";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { ROLES_KEY } from "./roles.decorator";

function contextFor(user: { role?: string } | undefined, metadata: Record<string, unknown>) {
  const handler = () => undefined;
  class Controller {}
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const context = {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
  return { guard: new RolesGuard(reflector), context };
}

describe("RolesGuard", () => {
  it("allows routes without role metadata", () => {
    const { guard, context } = contextFor({ role: "STUDENT" }, {});
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows public routes even when roles are set", () => {
    const { guard, context } = contextFor(undefined, { [IS_PUBLIC_KEY]: true, [ROLES_KEY]: ["ADMIN"] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows a user whose role is listed", () => {
    const { guard, context } = contextFor({ role: "TEACHER" }, { [ROLES_KEY]: ["TEACHER", "ADMIN"] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects a user whose role is not listed", () => {
    const { guard, context } = contextFor({ role: "STUDENT" }, { [ROLES_KEY]: ["ADMIN"] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("rejects when no user is attached", () => {
    const { guard, context } = contextFor(undefined, { [ROLES_KEY]: ["ADMIN"] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
