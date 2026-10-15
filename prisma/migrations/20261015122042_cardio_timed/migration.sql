-- CreateEnum
CREATE TYPE "ExerciseKind" AS ENUM ('REPS', 'TIME', 'CARDIO');

-- AlterEnum
ALTER TYPE "AchievementCategory" ADD VALUE 'ENDURANCE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecordType" ADD VALUE 'MAX_DURATION';
ALTER TYPE "RecordType" ADD VALUE 'MAX_DISTANCE';
ALTER TYPE "RecordType" ADD VALUE 'BEST_PACE';

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "kind" "ExerciseKind" NOT NULL DEFAULT 'REPS';

-- AlterTable
ALTER TABLE "WorkoutSet" ADD COLUMN     "distanceM" INTEGER,
ADD COLUMN     "durationSec" INTEGER;
