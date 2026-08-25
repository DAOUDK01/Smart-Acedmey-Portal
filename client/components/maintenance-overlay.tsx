"use client";

import type { ReactNode } from "react";
import { useMaintenance } from "@/lib/use-maintenance";
import MaintenanceScreen from "@/components/maintenance-screen";

export default function MaintenanceOverlay({ children }: { children: ReactNode }) {
  const { enabled, message, loading } = useMaintenance();

  if (loading) return children;
  if (enabled) return <MaintenanceScreen message={message} />;
  return children;
}