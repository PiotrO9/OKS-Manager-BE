/*
  Warnings:

  - Added the required column `updated_at` to the `user_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "school_settings" ALTER COLUMN "working_hours_start" SET DEFAULT '08:00'::time,
ALTER COLUMN "working_hours_end" SET DEFAULT '18:00'::time;

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- RenameIndex
ALTER INDEX "uq_vehicles_school_id_registration_number" RENAME TO "vehicles_school_id_registration_number_key";
