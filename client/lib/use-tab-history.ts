"use client";

import { useEffect, useRef } from "react";

export function getInitialTab(defaultTab: string): string {
  if (typeof window === "undefined") return defaultTab;
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab && tab.trim() ? tab : defaultTab;
}

/**
 * Mirrors the active tab into the browser history (?tab=...) so that the
 * browser back/forward buttons walk through previous tabs instead of
 * navigating away from the dashboard.
 */
export function useTabHistory(
  activeTab: string,
  setActiveTab: (tab: string) => void,
) {
  const suppressPushRef = useRef(false);
  const previousTabRef = useRef(activeTab);

  useEffect(() => {
    window.history.replaceState(
      { tab: activeTab },
      "",
      `${window.location.pathname}?tab=${activeTab}`,
    );
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const tab = (event.state as { tab?: string } | null)?.tab;
      if (tab && tab !== previousTabRef.current) {
        suppressPushRef.current = true;
        setActiveTab(tab);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setActiveTab]);

  useEffect(() => {
    const previous = previousTabRef.current;
    previousTabRef.current = activeTab;
    if (previous === activeTab) return;
    if (suppressPushRef.current) {
      suppressPushRef.current = false;
      return;
    }
    window.history.pushState(
      { tab: activeTab },
      "",
      `${window.location.pathname}?tab=${activeTab}`,
    );
  }, [activeTab]);
}