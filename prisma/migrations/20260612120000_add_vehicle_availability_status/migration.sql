CREATE TYPE "VehicleAvailabilityStatus" AS ENUM ('ACTIVE', 'UNAVAILABLE');

ALTER TABLE "vehicles"
ADD COLUMN "availability_status" "VehicleAvailabilityStatus" NOT NULL DEFAULT 'ACTIVE';
