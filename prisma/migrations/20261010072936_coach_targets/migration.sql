-- CreateTable
CREATE TABLE "CoachTarget" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sets" INTEGER,
    "reps" INTEGER,
    "weight" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachTarget_templateId_idx" ON "CoachTarget"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachTarget_clientId_templateId_exerciseId_key" ON "CoachTarget"("clientId", "templateId", "exerciseId");

-- AddForeignKey
ALTER TABLE "CoachTarget" ADD CONSTRAINT "CoachTarget_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachTarget" ADD CONSTRAINT "CoachTarget_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachTarget" ADD CONSTRAINT "CoachTarget_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
