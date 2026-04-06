-- AlterTable
ALTER TABLE "driving_schools" ADD COLUMN "default_vehicle_id" UUID;

-- AddForeignKey
ALTER TABLE "driving_schools" ADD CONSTRAINT "driving_schools_default_vehicle_id_fkey" FOREIGN KEY ("default_vehicle_id") REFERENCES "vehicles" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
