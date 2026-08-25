DO $$ BEGIN
  CREATE TYPE "CourseKind" AS ENUM ('THEORY_GROUP', 'PRACTICAL', 'EXTRA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "school_settings" ADD COLUMN "enabled_course_kinds" "CourseKind"[] NOT NULL DEFAULT ARRAY['THEORY_GROUP', 'PRACTICAL', 'EXTRA']::"CourseKind"[];

-- Schools without settings: create row with same defaults as Prisma SchoolSettings model
INSERT INTO "school_settings" (
    "id",
    "school_id",
    "working_days_mask",
    "working_hours_start",
    "working_hours_end",
    "slot_duration_minutes",
    "slot_must_start_full_hour",
    "practice_min_duration_minutes",
    "practice_max_duration_minutes",
    "theory_min_duration_minutes",
    "theory_max_duration_minutes",
    "booking_max_days_ahead",
    "created_at",
    "enabled_course_kinds"
)
SELECT
    gen_random_uuid(),
    ds."id",
    62,
    '08:00'::time,
    '18:00'::time,
    60,
    true,
    60,
    120,
    45,
    90,
    30,
    CURRENT_TIMESTAMP,
    ARRAY['THEORY_GROUP', 'PRACTICAL', 'EXTRA']::"CourseKind"[]
FROM "driving_schools" ds
WHERE ds."deleted_at" IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM "school_settings" ss WHERE ss."school_id" = ds."id"
  );
