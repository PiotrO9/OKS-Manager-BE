-- Prisma M:N with @relation("SchoolSettingsOfferedCourseTypes") uses "_SchoolSettingsOfferedCourseTypes".
-- Migration 20260408210000 initially created "_CourseTypeToSchoolSettings" (wrong implicit name).

DO $$
BEGIN
  IF to_regclass('public."_SchoolSettingsOfferedCourseTypes"') IS NULL THEN
    IF to_regclass('public."_CourseTypeToSchoolSettings"') IS NOT NULL THEN
      ALTER TABLE "_CourseTypeToSchoolSettings" RENAME TO "_SchoolSettingsOfferedCourseTypes";
    ELSE
      CREATE TABLE "_SchoolSettingsOfferedCourseTypes" (
        "A" UUID NOT NULL,
        "B" UUID NOT NULL,
        CONSTRAINT "_SchoolSettingsOfferedCourseTypes_AB_pkey" PRIMARY KEY ("A","B")
      );

      CREATE INDEX "_SchoolSettingsOfferedCourseTypes_B_index" ON "_SchoolSettingsOfferedCourseTypes"("B");

      ALTER TABLE "_SchoolSettingsOfferedCourseTypes"
        ADD CONSTRAINT "_SchoolSettingsOfferedCourseTypes_A_fkey"
        FOREIGN KEY ("A") REFERENCES "course_types" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "_SchoolSettingsOfferedCourseTypes"
        ADD CONSTRAINT "_SchoolSettingsOfferedCourseTypes_B_fkey"
        FOREIGN KEY ("B") REFERENCES "school_settings" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
