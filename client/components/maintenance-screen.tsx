"use client";

import { clearPortalSession } from "@/lib/session";
import { useRouter } from "next/navigation";

export default function MaintenanceScreen({
  message,
  adminBanner = false,
}: {
  message?: string;
  adminBanner?: boolean;
}) {
  const router = useRouter();

  function handleExit() {
    clearPortalSession();
    router.replace("/");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 px-4">
      <div className="max-w-lg w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/20 ring-1 ring-indigo-400/30 mb-6">
          <svg
            className="w-8 h-8 text-indigo-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Maintenance Mode</h1>
        <p className="text-slate-300 text-lg leading-relaxed mb-8">
          {message ||
            "The Smart Academy Portal is currently undergoing scheduled maintenance. Please check back soon."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-1.5 text-amber-300 text-sm font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
            </span>
            Access temporarily restricted
          </div>
          {!adminBanner && (
            <button
              onClick={handleExit}
              className="inline-flex items-center rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-4 py-1.5 text-sm font-medium transition-colors"
            >
              Log out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}