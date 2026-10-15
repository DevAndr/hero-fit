-- AlterTable
ALTER TABLE "User" ADD COLUMN     "goblinLastAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "goblinRolledSets" INTEGER NOT NULL DEFAULT 0;
