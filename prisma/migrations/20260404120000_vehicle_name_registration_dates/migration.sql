-- AlterTable: new canonical fields
ALTER TABLE "vehicles" ADD COLUMN "name" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "registration_number" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "inspection_date" TIMESTAMP(3);
ALTER TABLE "vehicles" ADD COLUMN "insurance_date" TIMESTAMP(3);

-- Backfill name from brand/model
UPDATE "vehicles"
SET "name" = TRIM(BOTH ' ' FROM concat_ws(' ', NULLIF(TRIM(BOTH FROM "brand"), ''), NULLIF(TRIM(BOTH FROM "model"), '')))
WHERE "name" IS NULL;

UPDATE "vehicles"
SET "name" = 'Vehicle'
WHERE "name" IS NULL OR TRIM("name") = '';

-- Backfill registration from plate_number; unique placeholder per row if missing
UPDATE "vehicles"
SET "registration_number" = TRIM("plate_number")
WHERE "plate_number" IS NOT NULL AND TRIM("plate_number") <> '';

UPDATE "vehicles"
SET "registration_number" = 'LEGACY-' || "id"::text
WHERE "registration_number" IS NULL;

-- Drop global unique on plate_number and remove column
DROP INDEX IF EXISTS "vehicles_plate_number_key";

ALTER TABLE "vehicles" DROP COLUMN "plate_number";

ALTER TABLE "vehicles" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "vehicles" ALTER COLUMN "registration_number" SET NOT NULL;

CREATE UNIQUE INDEX "uq_vehicles_school_id_registration_number" ON "vehicles"("school_id", "registration_number");
