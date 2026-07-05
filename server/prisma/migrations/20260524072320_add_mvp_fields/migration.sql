DO $$
BEGIN
  IF to_regclass('public."Checkpoint"') IS NOT NULL THEN
    ALTER TABLE "Checkpoint"
      ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Checkpoint',
      ADD COLUMN IF NOT EXISTS "unlockScore" INTEGER NOT NULL DEFAULT 70;
  END IF;

  IF to_regclass('public."Course"') IS NOT NULL THEN
    ALTER TABLE "Course"
      ADD COLUMN IF NOT EXISTS "code" TEXT,
      ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "level" TEXT,
      ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF to_regclass('public."Lecture"') IS NOT NULL THEN
    ALTER TABLE "Lecture"
      ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER,
      ADD COLUMN IF NOT EXISTS "isCheckpointLocked" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "lectureOrder" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "videoProvider" TEXT;
  END IF;

  IF to_regclass('public."QuizAttempt"') IS NOT NULL THEN
    ALTER TABLE "QuizAttempt"
      ADD COLUMN IF NOT EXISTS "attemptNumber" INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "passed" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "selectedAnswers" JSONB,
      ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;

  IF to_regclass('public."QuizQuestion"') IS NOT NULL THEN
    ALTER TABLE "QuizQuestion"
      ADD COLUMN IF NOT EXISTS "answerExplanation" TEXT,
      ADD COLUMN IF NOT EXISTS "attemptLimit" INTEGER NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "questionType" TEXT NOT NULL DEFAULT 'mcq';
  END IF;

  IF to_regclass('public."StudentProgress"') IS NOT NULL THEN
    ALTER TABLE "StudentProgress"
      ADD COLUMN IF NOT EXISTS "completedCheckpoints" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "currentCourseId" TEXT,
      ADD COLUMN IF NOT EXISTS "currentLectureId" TEXT,
      ADD COLUMN IF NOT EXISTS "guardianName" TEXT,
      ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lockedCheckpoints" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "progressPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "streakDays" INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF to_regclass('public."User"') IS NOT NULL THEN
    ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."Course"') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "Course_code_key" ON "Course"("code");
  END IF;
END $$;
