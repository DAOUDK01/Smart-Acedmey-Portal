"use client";

import { useRouter } from "next/navigation";
import { clearPortalSession, loadPortalSession } from "@/lib/session";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        const loginPath = loadPortalSession()?.role === "ADMIN" ? "/admin/login" : "/login";
        clearPortalSession();
        router.replace(loginPath);
      }}
      className="rounded-full px-4 py-2 text-sm text-slate-600 transition hover:text-rose-500"
    >
      Sign out
    </button>
  );
}
