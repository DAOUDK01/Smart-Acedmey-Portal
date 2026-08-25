-- CreateTable
CREATE TABLE "GuardianStudentLink" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianStudentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardianStudentLink_guardianId_studentId_key" ON "GuardianStudentLink"("guardianId", "studentId");

-- CreateIndex
CREATE INDEX "GuardianStudentLink_guardianId_idx" ON "GuardianStudentLink"("guardianId");

-- CreateIndex
CREATE INDEX "GuardianStudentLink_studentEmail_idx" ON "GuardianStudentLink"("studentEmail");
