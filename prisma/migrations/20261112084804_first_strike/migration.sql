-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'FIRST_STRIKE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstStrikeAt" TIMESTAMP(3);
