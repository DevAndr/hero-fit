-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'STREAK_RESTORE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "streakRestoredAt" TIMESTAMP(3);
