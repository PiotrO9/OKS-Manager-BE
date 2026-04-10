-- CreateEnum
CREATE TYPE "CourseParticipantStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- AlterTable
ALTER TABLE "course_participants" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "course_participants" ALTER COLUMN "status" TYPE "CourseParticipantStatus" USING ("status"::text::"CourseParticipantStatus");
ALTER TABLE "course_participants" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"CourseParticipantStatus";
