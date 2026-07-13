CREATE TABLE "AcademicClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademicClass_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassSection" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "classTeacherId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicClass_code_key" ON "AcademicClass"("code");
CREATE INDEX "AcademicClass_academicYear_isActive_idx" ON "AcademicClass"("academicYear", "isActive");
CREATE UNIQUE INDEX "ClassSection_classId_name_key" ON "ClassSection"("classId", "name");
CREATE INDEX "ClassSection_classId_isActive_idx" ON "ClassSection"("classId", "isActive");

ALTER TABLE "ClassSection"
ADD CONSTRAINT "ClassSection_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "AcademicClass"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
