-- AlterTable
ALTER TABLE "CoachProfile" ADD COLUMN     "catalogListed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactsConsentAt" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "telegram" TEXT,
ADD COLUMN     "vk" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "CoachContactClick" (
    "coachId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CoachContactClick_pkey" PRIMARY KEY ("coachId","day")
);

-- AddForeignKey
ALTER TABLE "CoachContactClick" ADD CONSTRAINT "CoachContactClick_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
