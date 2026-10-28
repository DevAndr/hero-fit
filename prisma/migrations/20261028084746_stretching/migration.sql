-- CreateEnum
CREATE TYPE "StretchZone" AS ENUM ('NECK', 'SHOULDERS', 'CHEST', 'BACK', 'LOWER_BACK', 'HIPS', 'HAMSTRINGS', 'QUADS', 'ADDUCTORS', 'CALVES');

-- CreateEnum
CREATE TYPE "StretchUnit" AS ENUM ('SESSIONS', 'MINUTES');

-- AlterEnum
ALTER TYPE "ExerciseKind" ADD VALUE 'STRETCH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GoalType" ADD VALUE 'STRETCH_WEEKLY';
ALTER TYPE "GoalType" ADD VALUE 'STRETCH_HOLD';
ALTER TYPE "GoalType" ADD VALUE 'STRETCH_SKILL';

-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE 'STRETCH_SESSION';

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "perSide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stretchZones" "StretchZone"[] DEFAULT ARRAY[]::"StretchZone"[];

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "skillTitle" TEXT,
ADD COLUMN     "stretchSkill" TEXT,
ADD COLUMN     "stretchUnit" "StretchUnit";

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "stretchOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StretchMeasurement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "cm" DECIMAL(5,1) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StretchMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StretchMeasurement_userId_idx" ON "StretchMeasurement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StretchMeasurement_goalId_date_key" ON "StretchMeasurement"("goalId", "date");

-- AddForeignKey
ALTER TABLE "StretchMeasurement" ADD CONSTRAINT "StretchMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StretchMeasurement" ADD CONSTRAINT "StretchMeasurement_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
