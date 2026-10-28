-- CreateEnum
CREATE TYPE "StretchCourseStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'COMPLETED', 'ABANDONED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_REMINDER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyCourse" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "courseSessionNo" INTEGER;

-- CreateTable
CREATE TABLE "StretchCourse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "goalId" TEXT,
    "remindDays" INTEGER[],
    "nextSession" INTEGER NOT NULL DEFAULT 1,
    "status" "StretchCourseStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "remindedDay" TEXT,

    CONSTRAINT "StretchCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StretchCourse_userId_idx" ON "StretchCourse"("userId");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "StretchCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StretchCourse" ADD CONSTRAINT "StretchCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StretchCourse" ADD CONSTRAINT "StretchCourse_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Один идущий курс на пользователя (Prisma частичные индексы не видит)
CREATE UNIQUE INDEX "StretchCourse_active" ON "StretchCourse"("userId") WHERE status IN ('ACTIVE', 'MAINTENANCE');
