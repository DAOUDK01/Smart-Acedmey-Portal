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
import {
  fetchMaintenance,
  type MaintenanceInfo,
} from "@/lib/use-maintenance";

export function usePortalLock(expectedPath: PortalPath) {
  const router = useRouter();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [ready, setReady] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceInfo | null>(null);

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

      const maintenanceInfo = await fetchMaintenance();
      if (!active) return;

      if (!sessionToUse) {
        setSession(null);
        setMaintenance(maintenanceInfo);
        setReady(false);
        router.replace(expectedPath === "/admin" ? "/admin/login" : "/login");
        return;
      }

      if (maintenanceInfo?.enabled && sessionToUse.role !== "ADMIN") {
        setSession(sessionToUse);
        setMaintenance(maintenanceInfo);
        setReady(true);
        return;
      }

      const dashboardPath = getDashboardPath(sessionToUse.role as PortalSession["role"]);
      if (dashboardPath !== expectedPath) {
        setSession(null);
        setMaintenance(null);
        setReady(false);
        router.replace(dashboardPath);
        return;
      }

      setSession(sessionToUse);
      setMaintenance(maintenanceInfo);
      setReady(true);
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
    maintenance,
  };
}
