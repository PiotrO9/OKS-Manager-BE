-- EventType may already exist (e.g. from `prisma db push` on dev).
DO $$ BEGIN
    CREATE TYPE "EventType" AS ENUM ('DRIVE', 'THEORY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "instructor_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instructor_id" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "vehicle_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_instructor_events_instructor_id_start_time" ON "instructor_events"("instructor_id", "start_time");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_instructor_events_vehicle_id_start_time" ON "instructor_events"("vehicle_id", "start_time");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "instructor_events" ADD CONSTRAINT "instructor_events_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "instructor_events" ADD CONSTRAINT "instructor_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
