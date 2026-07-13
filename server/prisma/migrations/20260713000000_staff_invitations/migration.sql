CREATE TYPE "StaffInvitationStatus" AS ENUM ('INVITED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');

CREATE TABLE "StaffInvitation" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "StaffInvitationStatus" NOT NULL DEFAULT 'INVITED',
  "phoneNumber" TEXT,
  "educationDetails" TEXT,
  "personalDetails" TEXT,
  "documentLinks" JSONB,
  "adminNotes" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffInvitation_email_key" ON "StaffInvitation"("email");
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_status_createdAt_idx" ON "StaffInvitation"("status", "createdAt");
