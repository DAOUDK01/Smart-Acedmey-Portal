-- AlterEnum
ALTER TYPE "QuizStatus" ADD VALUE 'TEACHER_APPROVED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'EXPERT';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
