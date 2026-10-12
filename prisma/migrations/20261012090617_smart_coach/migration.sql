-- CreateEnum
CREATE TYPE "Wellbeing" AS ENUM ('GREAT', 'OK', 'TIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "assistantEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "wellbeing" "Wellbeing";
