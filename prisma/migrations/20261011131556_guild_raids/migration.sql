-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RAID';

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'RAID_REWARD';

-- CreateTable
CREATE TABLE "RaidWeek" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bossCode" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "defeatedAt" TIMESTAMP(3),
    "mvpUserId" TEXT,
    "thursdayNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaidWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaidHit" (
    "id" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "damage" INTEGER NOT NULL,
    "crits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaidHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaidReward" (
    "id" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "mvp" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaidReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaidWeek_guildId_week_key" ON "RaidWeek"("guildId", "week");

-- CreateIndex
CREATE UNIQUE INDEX "RaidHit_workoutId_key" ON "RaidHit"("workoutId");

-- CreateIndex
CREATE INDEX "RaidHit_raidId_idx" ON "RaidHit"("raidId");

-- CreateIndex
CREATE UNIQUE INDEX "RaidReward_raidId_userId_key" ON "RaidReward"("raidId", "userId");

-- AddForeignKey
ALTER TABLE "RaidWeek" ADD CONSTRAINT "RaidWeek_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidWeek" ADD CONSTRAINT "RaidWeek_mvpUserId_fkey" FOREIGN KEY ("mvpUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidHit" ADD CONSTRAINT "RaidHit_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "RaidWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidHit" ADD CONSTRAINT "RaidHit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidHit" ADD CONSTRAINT "RaidHit_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidReward" ADD CONSTRAINT "RaidReward_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "RaidWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaidReward" ADD CONSTRAINT "RaidReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
