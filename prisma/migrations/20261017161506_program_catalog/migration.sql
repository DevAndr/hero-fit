-- AlterTable
ALTER TABLE "CoachProgram" ADD COLUMN     "catalogDescription" TEXT,
ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenReason" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProgramAssignment" ADD COLUMN     "catalogProgramId" TEXT;

-- CreateIndex
CREATE INDEX "CoachProgram_publishedAt_idx" ON "CoachProgram"("publishedAt");

-- CreateIndex
CREATE INDEX "ProgramAssignment_catalogProgramId_endedAt_idx" ON "ProgramAssignment"("catalogProgramId", "endedAt");

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_catalogProgramId_fkey" FOREIGN KEY ("catalogProgramId") REFERENCES "CoachProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
