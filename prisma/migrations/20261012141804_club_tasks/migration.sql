-- CreateEnum
CREATE TYPE "ClubTaskType" AS ENUM ('WORKOUTS', 'VOLUME', 'REPS', 'HOURS');

-- CreateEnum
CREATE TYPE "ClubTaskMode" AS ENUM ('CLUB', 'EACH');

-- AlterEnum
ALTER TYPE "AchievementCategory" ADD VALUE 'CLUB';

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'CLUB_TASK_REWARD';

-- CreateTable
CREATE TABLE "ClubTask" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "type" "ClubTaskType" NOT NULL,
    "mode" "ClubTaskMode" NOT NULL,
    "exerciseId" TEXT,
    "target" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "membersAtStart" INTEGER NOT NULL,
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubTaskHit" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubTaskHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubTaskReward" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubTaskReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubTask_clubId_endsAt_idx" ON "ClubTask"("clubId", "endsAt");

-- CreateIndex
CREATE INDEX "ClubTaskHit_taskId_userId_idx" ON "ClubTaskHit"("taskId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubTaskHit_taskId_workoutId_key" ON "ClubTaskHit"("taskId", "workoutId");

-- CreateIndex
CREATE INDEX "ClubTaskReward_userId_openedAt_idx" ON "ClubTaskReward"("userId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubTaskReward_taskId_userId_key" ON "ClubTaskReward"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "ClubTask" ADD CONSTRAINT "ClubTask_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTask" ADD CONSTRAINT "ClubTask_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTask" ADD CONSTRAINT "ClubTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTaskHit" ADD CONSTRAINT "ClubTaskHit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ClubTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTaskHit" ADD CONSTRAINT "ClubTaskHit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTaskHit" ADD CONSTRAINT "ClubTaskHit_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTaskReward" ADD CONSTRAINT "ClubTaskReward_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ClubTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTaskReward" ADD CONSTRAINT "ClubTaskReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
