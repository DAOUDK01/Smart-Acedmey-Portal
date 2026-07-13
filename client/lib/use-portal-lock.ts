"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDashboardPath,
  loadAccessToken,
  isAccessTokenValidForRole,
  loadPortalSession,
  type PortalPath,
  type PortalSession,
} from "@/lib/session";
import { refreshAccessToken } from "@/lib/api";

export function usePortalLock(expectedPath: PortalPath) {
  const router = useRouter();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const currentSession = loadPortalSession();
      let token = loadAccessToken();
      if (
        currentSession &&
        (!token || !isAccessTokenValidForRole(token, currentSession.role))
      ) {
        token = await refreshAccessToken();
      }
      if (!active) return;
      const sessionToUse =
        currentSession?.mode === "real" &&
        token &&
        isAccessTokenValidForRole(token, currentSession.role)
          ? currentSession
          : null;

      if (!sessionToUse) {
        setSession(null);
        setReady(true);
        router.replace(expectedPath === "/admin" ? "/admin/login" : "/login");
        return;
      }

      setSession(sessionToUse);
      setReady(true);

      const dashboardPath = getDashboardPath(sessionToUse.role as PortalSession["role"]);
      if (dashboardPath !== expectedPath) {
        router.replace(dashboardPath);
      }
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [expectedPath, router]);

  const isApproved = session?.role === "ADMIN" || session?.isActive === true;

  return {
    ready,
    session,
    isApproved: Boolean(isApproved),
  };
}
