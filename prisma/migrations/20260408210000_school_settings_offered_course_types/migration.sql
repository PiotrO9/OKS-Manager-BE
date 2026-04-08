-- Implicit M:N SchoolSettings <-> CourseType (@relation name SchoolSettingsOfferedCourseTypes → Prisma table name)
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

-- New schools: empty enabled kinds until PATCH; existing rows keep current values
ALTER TABLE "school_settings"
ALTER COLUMN "enabled_course_kinds" SET DEFAULT ARRAY[]::"CourseKind"[];

-- Seed Polish driving licence categories (idempotent)
INSERT INTO  "course_types" ("id", "code", "name", "created_at")
VALUES
  (gen_random_uuid(), 'AM', 'Kategoria AM', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'A1', 'Kategoria A1', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'A2', 'Kategoria A2', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'A', 'Kategoria A', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'B1', 'Kategoria B1', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'B', 'Kategoria B', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BE', 'Kategoria BE', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'C1', 'Kategoria C1', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'C', 'Kategoria C', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'C1E', 'Kategoria C1E', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CE', 'Kategoria CE', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'D1', 'Kategoria D1', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'D', 'Kategoria D', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'D1E', 'Kategoria D1E', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DE', 'Kategoria DE', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'T', 'Kategoria T', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
