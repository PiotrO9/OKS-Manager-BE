-- Optional link from instructor event to a course (e.g. theory block created from course view).
ALTER TABLE "instructor_events" ADD COLUMN "course_id" UUID;

ALTER TABLE "instructor_events"
  ADD CONSTRAINT "instructor_events_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_instructor_events_course_id" ON "instructor_events"("course_id");
