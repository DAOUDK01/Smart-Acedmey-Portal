"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDashboardPath,
  loadPortalSession,
  type PortalPath,
  type PortalSession,
} from "@/lib/session";

export function usePortalLock(expectedPath: PortalPath) {
  const router = useRouter();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const currentSession = loadPortalSession();
    // Allow a development fallback session so local dev pages can be inspected
    // without signing in. In production this will redirect to `/login`.
    let sessionToUse: PortalSession | null = currentSession;
    if (!currentSession || currentSession.mode !== "real") {
      if (process.env.NODE_ENV === "development") {
        sessionToUse = {
          role: "ADMIN" as any,
          name: "Dev Admin",
          email: "dev@local",
          isActive: true,
          mode: "real" as any,
        };
        setSession(sessionToUse);
        setReady(true);
      } else {
        setSession(null);
        setReady(true);
        router.replace("/login");
        return;
      }
    } else {
      setSession(currentSession);
      setReady(true);
    }

    if (sessionToUse) {
      if (!sessionToUse.isActive && sessionToUse.role !== "ADMIN") {
        router.replace("/login?error=pending_approval");
        return;
      }

      const dashboardPath = getDashboardPath(sessionToUse.role as any);
      if (dashboardPath !== expectedPath) {
        router.replace(dashboardPath);
      }
    }
  }, [expectedPath, router]);

  return {
    ready,
    session,
  };
}
