-- CreateEnum
CREATE TYPE "StreakCoverReason" AS ENUM ('FREEZE', 'RESTORE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastStreakWeek" TEXT,
ADD COLUMN     "streakReminderDay" TEXT,
ADD COLUMN     "weekWorkouts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weekWorkoutsKey" TEXT;

-- CreateTable
CREATE TABLE "StreakCoverWeek" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "reason" "StreakCoverReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakCoverWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreakCoverWeek_userId_week_key" ON "StreakCoverWeek"("userId", "week");

-- AddForeignKey
ALTER TABLE "StreakCoverWeek" ADD CONSTRAINT "StreakCoverWeek_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
