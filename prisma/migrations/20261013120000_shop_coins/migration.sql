-- CreateEnum
CREATE TYPE "CoinReason" AS ENUM ('WORKOUT', 'RECORD', 'DAILY_CHEST', 'BOSS_CHEST', 'RAID_CHEST', 'GOAL_CHEST', 'CLUB_TASK_CHEST', 'ACHIEVEMENT', 'STREAK_WEEK', 'LEVEL_UP', 'RETRO', 'PURCHASE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarCode" TEXT,
ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coinsSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "frameCode" TEXT,
ADD COLUMN     "nickColorCode" TEXT,
ADD COLUMN     "themeCode" TEXT;

-- CreateTable
CREATE TABLE "CoinTx" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "CoinReason" NOT NULL,
    "key" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoinTx_userId_reason_createdAt_idx" ON "CoinTx"("userId", "reason", "createdAt");

-- CreateIndex
CREATE INDEX "CoinTx_userId_createdAt_idx" ON "CoinTx"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoinTx_userId_key_key" ON "CoinTx"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "UserItem_userId_code_key" ON "UserItem"("userId", "code");

-- AddForeignKey
ALTER TABLE "CoinTx" ADD CONSTRAINT "CoinTx_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

