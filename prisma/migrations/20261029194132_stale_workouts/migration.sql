-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WORKOUT';

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "staleRemindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Workout_status_startedAt_idx" ON "Workout"("status", "startedAt");
