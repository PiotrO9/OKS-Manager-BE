-- AlterTable
ALTER TABLE "instructor_events" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "event_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_participants_event_student" ON "event_participants"("event_id", "student_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_event_participants_student_id" ON "event_participants"("student_id");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "instructor_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
