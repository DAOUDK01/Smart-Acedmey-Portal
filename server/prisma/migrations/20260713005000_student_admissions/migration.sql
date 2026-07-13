CREATE TYPE "StudentAdmissionStatus" AS ENUM ('REQUESTED', 'INVITED', 'SUBMITTED', 'APPROVED', 'REJECTED');

CREATE TABLE "StudentAdmission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "desiredClassId" TEXT NOT NULL,
    "assignedSectionId" TEXT,
    "selectedCourseIds" JSONB NOT NULL,
    "status" "StudentAdmissionStatus" NOT NULL DEFAULT 'REQUESTED',
    "tokenHash" TEXT,
    "phoneNumber" TEXT,
    "personalDetails" JSONB,
    "guardianDetails" JSONB,
    "educationDetails" JSONB,
    "documentLinks" JSONB,
    "adminNotes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentAdmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentAdmission_email_key" ON "StudentAdmission"("email");
CREATE UNIQUE INDEX "StudentAdmission_tokenHash_key" ON "StudentAdmission"("tokenHash");
CREATE INDEX "StudentAdmission_status_createdAt_idx" ON "StudentAdmission"("status", "createdAt");
CREATE INDEX "StudentAdmission_desiredClassId_assignedSectionId_idx" ON "StudentAdmission"("desiredClassId", "assignedSectionId");
ALTER TABLE "StudentAdmission" ADD CONSTRAINT "StudentAdmission_desiredClassId_fkey" FOREIGN KEY ("desiredClassId") REFERENCES "AcademicClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAdmission" ADD CONSTRAINT "StudentAdmission_assignedSectionId_fkey" FOREIGN KEY ("assignedSectionId") REFERENCES "ClassSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
