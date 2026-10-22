-- CreateEnum
CREATE TYPE "StudyPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StudyTaskType" AS ENUM ('WATCH_LECTURE', 'LEARN_TOPIC', 'PRACTICE_QUIZ', 'REVISE', 'REVIEW_MISTAKES');

-- CreateEnum
CREATE TYPE "StudyTaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "StudyTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "StudyPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "StudyPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "courseIds" JSONB NOT NULL,
    "topics" JSONB NOT NULL,
    "examDate" DATE,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dailyMinutes" INTEGER NOT NULL,
    "studyDays" JSONB NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "targetScore" INTEGER,
    "goal" TEXT,
    "generatedBy" TEXT NOT NULL,
    "aiSummary" TEXT,
    "recommendations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "courseId" TEXT,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "StudyTaskType" NOT NULL,
    "lectureId" TEXT,
    "mockExamId" TEXT,
    "scheduledDate" DATE NOT NULL,
    "startMinute" INTEGER,
    "durationMinutes" INTEGER NOT NULL,
    "priority" "StudyTaskPriority" NOT NULL,
    "status" "StudyTaskStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "skipReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "autoCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlanHistory" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyPlanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyPlan_studentId_status_idx" ON "StudyPlan"("studentId", "status");

-- CreateIndex
CREATE INDEX "StudyTask_planId_scheduledDate_idx" ON "StudyTask"("planId", "scheduledDate");

-- CreateIndex
CREATE INDEX "StudyPlanHistory_planId_createdAt_idx" ON "StudyPlanHistory"("planId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTask" ADD CONSTRAINT "StudyTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanHistory" ADD CONSTRAINT "StudyPlanHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

