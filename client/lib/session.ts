export type PortalRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN" | "EXPERT";

export type PortalSession = {
  role: PortalRole;
  name: string;
  email: string;
  isActive?: boolean;
  mode?: PortalMode;
};

export type PortalMode = "demo" | "real";

export type PortalPath = "/admin" | "/teacher" | "/student" | "/guardian" | "/expert";

const SESSION_STORAGE_KEY = "smart-academy:portal-session";

const roleRoutes: Record<PortalRole, PortalPath> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
  GUARDIAN: "/guardian",
  EXPERT: "/expert",
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
}
