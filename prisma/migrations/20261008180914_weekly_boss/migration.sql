-- AlterEnum
ALTER TYPE "AchievementCategory" ADD VALUE 'BOSS';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BOSS';

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'BOSS_REWARD';

-- CreateTable
CREATE TABLE "BossWeek" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "bossCode" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "defeatedAt" TIMESTAMP(3),
    "rewardOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BossWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BossWeek_userId_week_key" ON "BossWeek"("userId", "week");

-- AddForeignKey
ALTER TABLE "BossWeek" ADD CONSTRAINT "BossWeek_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
