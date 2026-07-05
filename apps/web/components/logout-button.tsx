"use client";

import { useRouter } from "next/navigation";
import { clearPortalSession } from "@/lib/session";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        clearPortalSession();
        router.replace("/login");
      }}
      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
    >
      Sign out
    </button>
  );
}
