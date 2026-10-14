ALTER TABLE "school_settings"
  ADD COLUMN "allow_short_final_practice_lesson" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "min_final_practice_duration_minutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "school_settings"
  ADD CONSTRAINT "school_settings_min_final_practice_duration_minutes_check"
  CHECK ("min_final_practice_duration_minutes" > 0 AND "min_final_practice_duration_minutes" <= "practice_min_duration_minutes");
