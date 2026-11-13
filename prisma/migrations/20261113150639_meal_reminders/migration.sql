-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MEAL_REMINDER';

-- CreateTable
CREATE TABLE "MealReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meal" "Meal" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "remindedDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealReminder_enabled_minutes_idx" ON "MealReminder"("enabled", "minutes");

-- CreateIndex
CREATE UNIQUE INDEX "MealReminder_userId_minutes_key" ON "MealReminder"("userId", "minutes");

-- AddForeignKey
ALTER TABLE "MealReminder" ADD CONSTRAINT "MealReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
