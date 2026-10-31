-- CreateEnum
CREATE TYPE "Meal" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateTable
CREATE TABLE "FoodEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "meal" "Meal" NOT NULL,
    "name" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodEntry_userId_date_idx" ON "FoodEntry"("userId", "date");

-- AddForeignKey
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
