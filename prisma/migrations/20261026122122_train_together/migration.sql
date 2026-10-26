-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('INVITED', 'ACTIVE', 'ENDED', 'DECLINED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'TOGETHER_BONUS';

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "hostWorkoutId" TEXT,
    "guestWorkoutId" TEXT,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "bonusAt" TIMESTAMP(3),

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionCheer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionCheer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_hostWorkoutId_key" ON "TrainingSession"("hostWorkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_guestWorkoutId_key" ON "TrainingSession"("guestWorkoutId");

-- CreateIndex
CREATE INDEX "TrainingSession_hostId_status_idx" ON "TrainingSession"("hostId", "status");

-- CreateIndex
CREATE INDEX "TrainingSession_guestId_status_idx" ON "TrainingSession"("guestId", "status");

-- CreateIndex
CREATE INDEX "SessionCheer_sessionId_createdAt_idx" ON "SessionCheer"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_hostWorkoutId_fkey" FOREIGN KEY ("hostWorkoutId") REFERENCES "Workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_guestWorkoutId_fkey" FOREIGN KEY ("guestWorkoutId") REFERENCES "Workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCheer" ADD CONSTRAINT "SessionCheer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCheer" ADD CONSTRAINT "SessionCheer_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
