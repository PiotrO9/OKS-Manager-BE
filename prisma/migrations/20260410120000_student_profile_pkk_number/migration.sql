-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN "pkk_number" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_pkk_number_key" ON "student_profiles"("pkk_number");
