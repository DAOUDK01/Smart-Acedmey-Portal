"use client";

import { ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";

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
    <Alert variant="warning" className="flex items-start gap-3">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-warning" />
      <span>
        Your {roleLabel} account is pending admin approval. The portal is open, but no data
        will load until an administrator activates your account.
      </span>
    </Alert>
  );
}
