-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AchievementCategory" ADD VALUE 'VOLUME';
ALTER TYPE "AchievementCategory" ADD VALUE 'RECORDS';
ALTER TYPE "AchievementCategory" ADD VALUE 'STRENGTH';
ALTER TYPE "AchievementCategory" ADD VALUE 'VARIETY';
ALTER TYPE "AchievementCategory" ADD VALUE 'TIME';
ALTER TYPE "AchievementCategory" ADD VALUE 'PROGRAMS';
ALTER TYPE "AchievementCategory" ADD VALUE 'MILESTONE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bodyWeight" DOUBLE PRECISION,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';
