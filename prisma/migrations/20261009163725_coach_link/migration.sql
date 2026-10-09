-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COACH';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coachCode" TEXT,
ADD COLUMN     "isCoach" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CoachLink" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,

    CONSTRAINT "CoachLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachLink_coachId_endedAt_idx" ON "CoachLink"("coachId", "endedAt");

-- CreateIndex
CREATE INDEX "CoachLink_clientId_endedAt_idx" ON "CoachLink"("clientId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_coachCode_key" ON "User"("coachCode");

-- AddForeignKey
ALTER TABLE "CoachLink" ADD CONSTRAINT "CoachLink_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachLink" ADD CONSTRAINT "CoachLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- У клиента не больше одной активной связи с тренером
CREATE UNIQUE INDEX "CoachLink_active_client" ON "CoachLink"("clientId") WHERE "endedAt" IS NULL;
