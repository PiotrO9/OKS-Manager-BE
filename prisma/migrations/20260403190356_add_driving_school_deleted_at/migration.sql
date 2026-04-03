-- AlterTable
ALTER TABLE "school_settings" ALTER COLUMN "working_hours_start" SET DEFAULT '08:00'::time,
ALTER COLUMN "working_hours_end" SET DEFAULT '18:00'::time;
