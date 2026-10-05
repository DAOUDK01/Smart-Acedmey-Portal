import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export type AppRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";

/** Restrict a controller or handler to the given roles. A handler-level value overrides the class-level one. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
