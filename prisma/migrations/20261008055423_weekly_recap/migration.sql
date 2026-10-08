-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RECAP';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyRecap" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recapNudgeWeek" TEXT;

-- CreateTable
CREATE TABLE "WeeklyRecap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pushedAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyRecap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyRecap_userId_week_key" ON "WeeklyRecap"("userId", "week");

-- AddForeignKey
ALTER TABLE "WeeklyRecap" ADD CONSTRAINT "WeeklyRecap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
