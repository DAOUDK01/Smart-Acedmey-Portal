ALTER TABLE "ClassSection" DROP COLUMN "room", DROP COLUMN "classTeacherId";

CREATE TABLE "ClassCourseAssignment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassCourseAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassCourseAssignment_classId_courseId_key" ON "ClassCourseAssignment"("classId", "courseId");
CREATE INDEX "ClassCourseAssignment_teacherId_isActive_idx" ON "ClassCourseAssignment"("teacherId", "isActive");

ALTER TABLE "ClassCourseAssignment" ADD CONSTRAINT "ClassCourseAssignment_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "AcademicClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassCourseAssignment" ADD CONSTRAINT "ClassCourseAssignment_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassCourseAssignment" ADD CONSTRAINT "ClassCourseAssignment_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
