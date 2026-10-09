-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN     "coachId" TEXT;

-- AlterTable
ALTER TABLE "PlanSeries" ADD COLUMN     "coachId" TEXT;

-- CreateIndex
CREATE INDEX "PlanEntry_userId_coachId_idx" ON "PlanEntry"("userId", "coachId");

-- CreateIndex
CREATE INDEX "PlanSeries_userId_coachId_idx" ON "PlanSeries"("userId", "coachId");

-- AddForeignKey
ALTER TABLE "PlanSeries" ADD CONSTRAINT "PlanSeries_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

