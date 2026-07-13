UPDATE "User" SET "role" = 'TEACHER' WHERE "role" = 'EXPERT';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN');

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING "role"::text::"UserRole";

ALTER TABLE "StaffInvitation"
  ALTER COLUMN "role" TYPE "UserRole"
  USING "role"::text::"UserRole";

DROP TYPE "UserRole_old";

UPDATE "QuizQuestion" SET "status" = 'APPROVED' WHERE "status" = 'TEACHER_APPROVED';

ALTER TYPE "QuizStatus" RENAME TO "QuizStatus_old";

CREATE TYPE "QuizStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EDITED');

ALTER TABLE "QuizQuestion"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "QuizStatus"
  USING "status"::text::"QuizStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "QuizStatus_old";
