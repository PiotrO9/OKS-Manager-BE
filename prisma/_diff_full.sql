-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'INSTRUCTOR', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('THEORY', 'PRACTICE');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentPlanType" AS ENUM ('FULL', 'INSTALLMENTS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "CourseKind" AS ENUM ('THEORY_GROUP', 'PRACTICAL', 'EXTRA');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "default_osk_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "theme_mode" TEXT DEFAULT 'light',
    "language" TEXT DEFAULT 'pl',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driving_schools" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "default_vehicle_id" UUID,

    CONSTRAINT "driving_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "working_days_mask" INTEGER NOT NULL DEFAULT 62,
    "working_hours_start" TIME NOT NULL DEFAULT '08:00'::time,
    "working_hours_end" TIME NOT NULL DEFAULT '18:00'::time,
    "slot_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "slot_must_start_full_hour" BOOLEAN NOT NULL DEFAULT true,
    "practice_min_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "practice_max_duration_minutes" INTEGER NOT NULL DEFAULT 120,
    "theory_min_duration_minutes" INTEGER NOT NULL DEFAULT 45,
    "theory_max_duration_minutes" INTEGER NOT NULL DEFAULT 90,
    "booking_max_days_ahead" INTEGER NOT NULL DEFAULT 30,
    "enabled_course_kinds" "CourseKind"[] DEFAULT ARRAY[]::"CourseKind"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "license_number" TEXT NOT NULL,
    "experience_years" INTEGER,
    "qualifications" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pesel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_schools" (
    "id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_schools" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "inspection_date" TIMESTAMP(3),
    "insurance_date" TIMESTAMP(3),
    "brand" TEXT,
    "model" TEXT,
    "photo_url" TEXT,
    "model_year" INTEGER,
    "mileage_km" INTEGER,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" "CourseKind" NOT NULL,
    "total_hours" INTEGER NOT NULL,
    "capacity" INTEGER,
    "theory_start_date" DATE,
    "theory_end_date" DATE,
    "instructor_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_participants" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "lesson_type" "LessonType" NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_working_hours_default" (
    "id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_working_hours_default_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_working_hours" (
    "id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME,
    "end_time" TIME,
    "is_day_off" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_time_blocks" (
    "id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "school_id" UUID,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_time_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_leaves" (
    "id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "type" "PaymentPlanType" NOT NULL,
    "number_of_installments" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "payment_plan_id" UUID NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "due_date" DATE,
    "paid_at" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_ratings" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SchoolSettingsOfferedCourseTypes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_SchoolSettingsOfferedCourseTypes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_settings_school_id_key" ON "school_settings"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_profiles_user_id_key" ON "instructor_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_key" ON "student_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_pesel_key" ON "student_profiles"("pesel");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_schools_instructor_id_school_id_key" ON "instructor_schools"("instructor_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_schools_student_id_school_id_key" ON "student_schools"("student_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_school_id_registration_number_key" ON "vehicles"("school_id", "registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "course_types_code_key" ON "course_types"("code");

-- CreateIndex
CREATE INDEX "idx_course_participants_student_id" ON "course_participants"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_participants_course_id_student_id_key" ON "course_participants"("course_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_lessons_instructor_id_start_time" ON "lessons"("instructor_id", "start_time");

-- CreateIndex
CREATE INDEX "idx_lessons_vehicle_id_start_time" ON "lessons"("vehicle_id", "start_time");

-- CreateIndex
CREATE INDEX "idx_lessons_student_id_start_time" ON "lessons"("student_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_working_hours_instructor_id_date_key" ON "instructor_working_hours"("instructor_id", "date");

-- CreateIndex
CREATE INDEX "idx_payments_payment_plan_id_status" ON "payments"("payment_plan_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_ratings_lesson_id_key" ON "lesson_ratings"("lesson_id");

-- CreateIndex
CREATE INDEX "_SchoolSettingsOfferedCourseTypes_B_index" ON "_SchoolSettingsOfferedCourseTypes"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_osk_id_fkey" FOREIGN KEY ("default_osk_id") REFERENCES "driving_schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_schools" ADD CONSTRAINT "driving_schools_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_schools" ADD CONSTRAINT "driving_schools_default_vehicle_id_fkey" FOREIGN KEY ("default_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "driving_schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_schools" ADD CONSTRAINT "instructor_schools_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_schools" ADD CONSTRAINT "instructor_schools_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "driving_schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_schools" ADD CONSTRAINT "student_schools_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_schools" ADD CONSTRAINT "student_schools_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "driving_schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "driving_schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "driving_schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_participants" ADD CONSTRAINT "course_participants_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_participants" ADD CONSTRAINT "course_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_working_hours_default" ADD CONSTRAINT "instructor_working_hours_default_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_working_hours" ADD CONSTRAINT "instructor_working_hours_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_time_blocks" ADD CONSTRAINT "instructor_time_blocks_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_time_blocks" ADD CONSTRAINT "instructor_time_blocks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "driving_schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_leaves" ADD CONSTRAINT "instructor_leaves_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_plan_id_fkey" FOREIGN KEY ("payment_plan_id") REFERENCES "payment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SchoolSettingsOfferedCourseTypes" ADD CONSTRAINT "_SchoolSettingsOfferedCourseTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "course_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SchoolSettingsOfferedCourseTypes" ADD CONSTRAINT "_SchoolSettingsOfferedCourseTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "school_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

