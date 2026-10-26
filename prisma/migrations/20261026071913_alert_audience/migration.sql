-- CreateEnum
CREATE TYPE "SystemAlertAudience" AS ENUM ('ALL', 'USERS', 'COACHES');

-- AlterTable
ALTER TABLE "SystemAlert" ADD COLUMN     "audience" "SystemAlertAudience" NOT NULL DEFAULT 'ALL';
