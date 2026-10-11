-- CreateEnum
CREATE TYPE "CoachSignalKind" AS ENUM ('MISSED_PLAN', 'STALLED', 'ACTIVITY_DROP', 'INACTIVE');

-- AlterTable
ALTER TABLE "CoachTarget" ADD COLUMN     "unloadedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coachSignalsDay" TEXT;

-- CreateTable
CREATE TABLE "CoachSignal" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "CoachSignalKind" NOT NULL,
    "since" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CoachSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachSignal_coachId_clientId_idx" ON "CoachSignal"("coachId", "clientId");

-- AddForeignKey
ALTER TABLE "CoachSignal" ADD CONSTRAINT "CoachSignal_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSignal" ADD CONSTRAINT "CoachSignal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
