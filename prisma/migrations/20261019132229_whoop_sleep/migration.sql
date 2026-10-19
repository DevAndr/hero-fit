-- AlterTable
ALTER TABLE "WhoopConnection" ADD COLUMN     "scopes" TEXT NOT NULL DEFAULT '';

-- Существующие подключения выданы до сна и восстановления
UPDATE "WhoopConnection" SET "scopes" = 'read:workout read:profile offline';

-- CreateTable
CREATE TABLE "WhoopSleep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "sleepScoreState" TEXT NOT NULL,
    "sleepMs" INTEGER,
    "needMs" INTEGER,
    "performancePct" INTEGER,
    "recoveryScoreState" TEXT,
    "recoveryPct" INTEGER,
    "restingHr" INTEGER,
    "hrvMs" DOUBLE PRECISION,
    "calibrating" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopSleep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhoopSleep_userId_end_idx" ON "WhoopSleep"("userId", "end");

-- AddForeignKey
ALTER TABLE "WhoopSleep" ADD CONSTRAINT "WhoopSleep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
