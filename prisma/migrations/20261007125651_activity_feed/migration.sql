-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hideWeights" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareActivity" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Kudos" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kudos_workoutId_userId_key" ON "Kudos"("workoutId", "userId");

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
