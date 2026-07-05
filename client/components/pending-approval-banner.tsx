"use client";

import { ShieldAlert } from "lucide-react";

export function PendingApprovalBanner({
  roleLabel,
  isApproved,
}: {
  roleLabel: string;
  isApproved: boolean;
}) {
  if (isApproved) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      Your {roleLabel} account is pending admin approval. The portal is open, but no data
      will load until an administrator activates your account.
    </div>
  );
}
