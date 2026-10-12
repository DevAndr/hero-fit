-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "about" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "citySlug" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Club_publishedAt_citySlug_idx" ON "Club"("publishedAt", "citySlug");

-- CreateIndex
CREATE UNIQUE INDEX "Club_citySlug_slug_key" ON "Club"("citySlug", "slug");

