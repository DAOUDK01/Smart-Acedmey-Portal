"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

export interface MaintenanceInfo {
  enabled: boolean;
  message: string;
}

let cached: MaintenanceInfo | null = null;
let fetchPromise: Promise<MaintenanceInfo> | null = null;

export function invalidateMaintenanceCache() {
  cached = null;
}

export function fetchMaintenance(): Promise<MaintenanceInfo> {
  if (cached) return Promise.resolve(cached);
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/system/maintenance`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return { enabled: false, message: "" };
      }
      const data = (await response.json()) as MaintenanceInfo;
      cached = {
        enabled: Boolean(data.enabled),
        message: String(data.message ?? ""),
      };
      return cached;
    } catch {
      return { enabled: false, message: "" };
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function useMaintenance() {
  const [info, setInfo] = useState<MaintenanceInfo>(
    () => cached ?? { enabled: false, message: "" },
  );
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async () => {
    invalidateMaintenanceCache();
    const data = await fetchMaintenance();
    setInfo(data);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...info, loading, refresh };
}