export type PortalRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";

export type PortalSession = {
  role: PortalRole;
  name: string;
  email: string;
  isActive?: boolean;
  mode?: PortalMode;
};

export type PortalMode = "demo" | "real";

export type PortalPath = "/admin" | "/teacher" | "/student" | "/guardian";

const SESSION_STORAGE_KEY = "smart-academy:portal-session";
const ACCESS_TOKEN_STORAGE_KEY = "smart-academy:access-token";
const REFRESH_TOKEN_STORAGE_KEY = "smart-academy:refresh-token";

const roleRoutes: Record<PortalRole, PortalPath> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
  GUARDIAN: "/guardian",
};

export function getDashboardPath(role: PortalRole): PortalPath {
  return roleRoutes[role];
}

export function savePortalSession(session: PortalSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      ...session,
      mode: session.mode ?? "real",
      savedAt: new Date().toISOString(),
    }),
  );
}

export function loadPortalSession(): PortalSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as PortalSession;
    return { ...parsedSession, mode: parsedSession.mode ?? "real" };
  } catch {
    return null;
  }
}

export function clearPortalSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function saveAccessToken(token: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  }
}

export function loadAccessToken(): string | null {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function saveRefreshToken(token: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
  }
}

export function loadRefreshToken(): string | null {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function isAccessTokenValidForRole(token: string, role: PortalRole): boolean {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return false;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(normalized)) as {
      role?: PortalRole;
      exp?: number;
      tokenType?: string;
    };
    return (
      payload.tokenType === "access" &&
      payload.role === role &&
      typeof payload.exp === "number" &&
      payload.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
}
