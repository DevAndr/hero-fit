-- CreateTable
CREATE TABLE "LandingVisit" (
    "hour" TIMESTAMPTZ(3) NOT NULL,
    "landing" TEXT NOT NULL,
    "referrer" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "LandingVisit_pkey" PRIMARY KEY ("hour","landing","referrer")
);

-- CreateTable
CREATE TABLE "LandingUtmVisit" (
    "hour" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "LandingUtmVisit_pkey" PRIMARY KEY ("hour","source","campaign")
);
