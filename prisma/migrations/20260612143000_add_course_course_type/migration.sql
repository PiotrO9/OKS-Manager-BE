ALTER TABLE "courses" ADD COLUMN "course_type_id" UUID;

INSERT INTO "course_types" ("id", "code", "name", "created_at")
SELECT gen_random_uuid(), src."code", src."code", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT btrim("category") AS "code"
    FROM "courses"
    WHERE btrim("category") <> ''
) AS src
WHERE NOT EXISTS (
    SELECT 1
    FROM "course_types" ct
    WHERE ct."code" = src."code"
);

UPDATE "courses" c
SET "course_type_id" = ct."id"
FROM "course_types" ct
WHERE ct."code" = btrim(c."category")
  AND c."course_type_id" IS NULL;

ALTER TABLE "courses" ALTER COLUMN "course_type_id" SET NOT NULL;

ALTER TABLE "courses"
ADD CONSTRAINT "courses_course_type_id_fkey"
FOREIGN KEY ("course_type_id") REFERENCES "course_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_courses_course_type_id" ON "courses"("course_type_id");
