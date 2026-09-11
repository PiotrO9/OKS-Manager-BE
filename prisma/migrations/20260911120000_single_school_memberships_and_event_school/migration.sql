DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM instructor_schools
    GROUP BY instructor_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add one-school invariant: duplicate instructor_schools.instructor_id rows exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM student_schools
    GROUP BY student_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add one-school invariant: duplicate student_schools.student_id rows exist';
  END IF;
END $$;

ALTER TABLE "instructor_events"
  ADD COLUMN "school_id" uuid;

UPDATE "instructor_events" ie
SET "school_id" = COALESCE(
  (SELECT c."school_id" FROM "courses" c WHERE c."id" = ie."course_id"),
  (SELECT v."school_id" FROM "vehicles" v WHERE v."id" = ie."vehicle_id"),
  (
    SELECT isch."school_id"
    FROM "instructor_schools" isch
    WHERE isch."instructor_id" = ie."instructor_id"
    LIMIT 1
  )
)
WHERE ie."school_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "instructor_events" WHERE "school_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot set instructor_events.school_id NOT NULL: events without resolvable school exist';
  END IF;
END $$;

ALTER TABLE "instructor_events"
  ALTER COLUMN "school_id" SET NOT NULL;

ALTER TABLE "instructor_events"
  ADD CONSTRAINT "instructor_events_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "driving_schools"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_instructor_schools_instructor_id"
  ON "instructor_schools"("instructor_id");

CREATE UNIQUE INDEX "uq_student_schools_student_id"
  ON "student_schools"("student_id");

CREATE INDEX "idx_instructor_events_school_id_start_time"
  ON "instructor_events"("school_id", "start_time");
