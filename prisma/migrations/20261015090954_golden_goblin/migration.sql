-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'GOBLIN_CHEST';

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'GOBLIN_REWARD';

-- CreateTable
CREATE TABLE "GoblinEncounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "spawnedAt" TIMESTAMP(3) NOT NULL,
    "caughtAt" TIMESTAMP(3),
    "rewardOpenedAt" TIMESTAMP(3),

    CONSTRAINT "GoblinEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoblinEncounter_workoutId_key" ON "GoblinEncounter"("workoutId");

-- CreateIndex
CREATE INDEX "GoblinEncounter_userId_spawnedAt_idx" ON "GoblinEncounter"("userId", "spawnedAt");

-- AddForeignKey
ALTER TABLE "GoblinEncounter" ADD CONSTRAINT "GoblinEncounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoblinEncounter" ADD CONSTRAINT "GoblinEncounter_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
