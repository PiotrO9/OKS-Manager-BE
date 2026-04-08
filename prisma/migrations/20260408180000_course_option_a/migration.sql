-- CreateEnum
CREATE TYPE "CourseKind" AS ENUM ('THEORY_GROUP', 'PRACTICAL', 'EXTRA');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "name" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "kind" "CourseKind",
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "instructor_id" UUID;

-- Backfill from course_types
UPDATE "courses" c
SET
  "category" = ct."code",
  "name" = ct."name"
FROM "course_types" ct
WHERE c."course_type_id" = ct."id";

UPDATE "courses"
SET
  "category" = COALESCE("category", 'UNK'),
  "name" = COALESCE("name", "category", 'Course')
WHERE "category" IS NULL OR "name" IS NULL OR TRIM(COALESCE("name", '')) = '';

UPDATE "courses"
SET "kind" = 'PRACTICAL'::"CourseKind"
WHERE "kind" IS NULL;

ALTER TABLE "courses" ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "kind" SET NOT NULL;

-- CreateTable
CREATE TABLE "course_participants" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_course_participants_course_id_student_id" ON "course_participants" ("course_id", "student_id");

CREATE INDEX "idx_course_participants_student_id" ON "course_participants" ("student_id");

ALTER TABLE "course_participants" ADD CONSTRAINT "course_participants_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_participants" ADD CONSTRAINT "course_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "course_participants" ("id", "course_id", "student_id", "created_at")
SELECT gen_random_uuid(), "id", "student_id", "created_at" FROM "courses";

-- Drop old course columns
ALTER TABLE "courses" DROP CONSTRAINT "courses_student_id_fkey";

ALTER TABLE "courses" DROP CONSTRAINT "courses_course_type_id_fkey";

ALTER TABLE "courses" DROP COLUMN "student_id",
  DROP COLUMN "course_type_id";

ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
