-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyCoachRecap" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CoachWeeklyRecap" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pushedAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "CoachWeeklyRecap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachRecapClient" (
    "recapId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "CoachRecapClient_pkey" PRIMARY KEY ("recapId","clientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachWeeklyRecap_coachId_week_key" ON "CoachWeeklyRecap"("coachId", "week");

-- CreateIndex
CREATE INDEX "CoachRecapClient_clientId_idx" ON "CoachRecapClient"("clientId");

-- AddForeignKey
ALTER TABLE "CoachWeeklyRecap" ADD CONSTRAINT "CoachWeeklyRecap_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachRecapClient" ADD CONSTRAINT "CoachRecapClient_recapId_fkey" FOREIGN KEY ("recapId") REFERENCES "CoachWeeklyRecap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachRecapClient" ADD CONSTRAINT "CoachRecapClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
