import { type PortalRole } from "@/lib/session";

const LOCAL_USERS_KEY = "smart-academy:local-auth-users";

export type AuthUser = {
  id: string;
  role: PortalRole;
  name: string;
  email: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function readStoredUsers() {
  if (typeof window === "undefined") {
    return [] as AuthUser[];
  }

  const rawUsers = window.localStorage.getItem(LOCAL_USERS_KEY);
  if (!rawUsers) {
    return [] as AuthUser[];
  }

  try {
    return JSON.parse(rawUsers) as AuthUser[];
  } catch {
    return [] as AuthUser[];
  }
}

function writeStoredUsers(users: AuthUser[]) {
  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

export function listAvailableAuthUsers() {
  return readStoredUsers();
}

export function findAuthUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return (
    listAvailableAuthUsers().find(
      (user) => user.email.trim().toLowerCase() === normalizedEmail,
    ) ?? null
  );
}

export function saveLocalAuthUser(
  input: Omit<AuthUser, "id" | "createdAt" | "updatedAt">,
) {
  const now = new Date().toISOString();
  const nextUser: AuthUser = {
    ...input,
    id: `local-user-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };

  const nextUsers = [
    ...readStoredUsers().filter(
      (user) =>
        user.email.trim().toLowerCase() !== input.email.trim().toLowerCase(),
    ),
    nextUser,
  ];
  writeStoredUsers(nextUsers);

  return nextUser;
}
