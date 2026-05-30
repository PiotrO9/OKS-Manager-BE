-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE';
