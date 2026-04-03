/*
  Warnings:

  - You are about to drop the column `time_range` on the `lessons` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "lessons" DROP COLUMN "time_range";

-- AlterTable
ALTER TABLE "school_settings" ALTER COLUMN "working_hours_start" SET DEFAULT '08:00'::time,
ALTER COLUMN "working_hours_end" SET DEFAULT '18:00'::time;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "default_osk_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_osk_id_fkey" FOREIGN KEY ("default_osk_id") REFERENCES "driving_schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "users_email_active_idx" RENAME TO "users_email_key";
