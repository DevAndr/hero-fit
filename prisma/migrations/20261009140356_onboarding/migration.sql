-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- Экскурсия — для новых пользователей: уже зарегистрированным считаем пройденной
UPDATE "User" SET "onboardedAt" = NOW();
