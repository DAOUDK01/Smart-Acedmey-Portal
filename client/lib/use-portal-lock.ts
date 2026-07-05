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
    let sessionToUse: PortalSession | null = currentSession;

    if (!currentSession || currentSession.mode !== "real") {
      if (process.env.NODE_ENV === "development") {
        sessionToUse = {
          role: expectedPath === "/admin" ? "ADMIN" : expectedPath === "/teacher" ? "TEACHER" : expectedPath === "/expert" ? "EXPERT" : expectedPath === "/guardian" ? "GUARDIAN" : "STUDENT",
          name: "Dev User",
          email: "dev@local",
          isActive: true,
          mode: "real" as const,
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
      const dashboardPath = getDashboardPath(sessionToUse.role as PortalSession["role"]);
      if (dashboardPath !== expectedPath) {
        router.replace(dashboardPath);
      }
    }
  }, [expectedPath, router]);

  const isApproved = session?.role === "ADMIN" || session?.isActive === true;

  return {
    ready,
    session,
    isApproved: Boolean(isApproved),
  };
}
