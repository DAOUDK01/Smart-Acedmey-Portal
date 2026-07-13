CREATE TABLE "SectionCourseAssignment" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SectionCourseAssignment_pkey" PRIMARY KEY ("id")
);

-- Preserve existing class-level assignments by copying them to every existing section in that class.
INSERT INTO "SectionCourseAssignment" ("id", "sectionId", "courseId", "teacherId", "isActive", "createdAt", "updatedAt")
SELECT assignment."id" || '-' || section."id", section."id", assignment."courseId", assignment."teacherId",
       assignment."isActive", assignment."createdAt", assignment."updatedAt"
FROM "ClassCourseAssignment" assignment
JOIN "ClassSection" section ON section."classId" = assignment."classId";

CREATE UNIQUE INDEX "SectionCourseAssignment_sectionId_courseId_key" ON "SectionCourseAssignment"("sectionId", "courseId");
CREATE INDEX "SectionCourseAssignment_teacherId_isActive_idx" ON "SectionCourseAssignment"("teacherId", "isActive");

ALTER TABLE "SectionCourseAssignment" ADD CONSTRAINT "SectionCourseAssignment_sectionId_fkey"
FOREIGN KEY ("sectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionCourseAssignment" ADD CONSTRAINT "SectionCourseAssignment_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionCourseAssignment" ADD CONSTRAINT "SectionCourseAssignment_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "ClassCourseAssignment";
