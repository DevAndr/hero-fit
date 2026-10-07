-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PLAN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyPlan" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "planReminderMin" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "planKey" TEXT;

-- CreateTable
CREATE TABLE "PlanSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seriesId" TEXT,
    "originalDate" TEXT,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanSeries_userId_idx" ON "PlanSeries"("userId");

-- CreateIndex
CREATE INDEX "PlanEntry_userId_date_idx" ON "PlanEntry"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntry_seriesId_originalDate_key" ON "PlanEntry"("seriesId", "originalDate");

-- CreateIndex
CREATE UNIQUE INDEX "PlanReminder_userId_planKey_key" ON "PlanReminder"("userId", "planKey");

-- AddForeignKey
ALTER TABLE "PlanSeries" ADD CONSTRAINT "PlanSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSeries" ADD CONSTRAINT "PlanSeries_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "PlanSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanReminder" ADD CONSTRAINT "PlanReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
