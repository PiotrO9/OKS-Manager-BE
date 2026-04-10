-- CreateEnum
CREATE TYPE "InstructorTimeBlockType" AS ENUM ('BREAK', 'MEETING', 'OTHER');

-- AlterTable: change type column from text to enum
ALTER TABLE "instructor_time_blocks"
  ALTER COLUMN "type" TYPE "InstructorTimeBlockType" USING "type"::"InstructorTimeBlockType";

-- CreateIndex: unique (instructor_id, day_of_week) on InstructorWorkingHoursDefault
CREATE UNIQUE INDEX "uq_instructor_working_hours_default_instructor_id_day_of_week"
  ON "instructor_working_hours_default"("instructor_id", "day_of_week");
