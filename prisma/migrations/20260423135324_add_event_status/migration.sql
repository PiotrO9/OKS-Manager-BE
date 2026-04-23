-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PLANNED', 'DONE', 'NO_SHOW', 'CANCELLED');

-- AlterTable
ALTER TABLE "instructor_events" ADD COLUMN "status" "EventStatus" NOT NULL DEFAULT 'PLANNED';
