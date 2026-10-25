-- CreateTable
CREATE TABLE "AppVisit" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "version" TEXT,

    CONSTRAINT "AppVisit_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "ApkDownload" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "ApkDownload_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "AppVisit_day_idx" ON "AppVisit"("day");

-- AddForeignKey
ALTER TABLE "AppVisit" ADD CONSTRAINT "AppVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
