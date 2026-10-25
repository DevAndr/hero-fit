-- CreateEnum
CREATE TYPE "PushKind" AS ENUM ('WEB', 'UNIFIEDPUSH', 'EMBEDDED');

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "kind" "PushKind" NOT NULL DEFAULT 'WEB';
