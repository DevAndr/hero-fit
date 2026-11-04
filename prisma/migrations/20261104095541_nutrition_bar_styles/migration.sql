-- CreateEnum
CREATE TYPE "CalorieBar" AS ENUM ('RING', 'CAULDRON', 'DONUT');

-- AlterTable: выбор котёл/кольцо переносится в вид шкалы
ALTER TABLE "User" ADD COLUMN "nutritionBar" "CalorieBar" NOT NULL DEFAULT 'CAULDRON';
UPDATE "User" SET "nutritionBar" = 'RING' WHERE "nutritionCauldron" = false;
ALTER TABLE "User" DROP COLUMN "nutritionCauldron";
