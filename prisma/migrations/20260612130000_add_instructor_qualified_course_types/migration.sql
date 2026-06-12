CREATE TABLE "_InstructorQualifiedCourseTypes" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_InstructorQualifiedCourseTypes_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_InstructorQualifiedCourseTypes_B_index" ON "_InstructorQualifiedCourseTypes"("B");

ALTER TABLE "_InstructorQualifiedCourseTypes"
ADD CONSTRAINT "_InstructorQualifiedCourseTypes_A_fkey"
FOREIGN KEY ("A") REFERENCES "course_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_InstructorQualifiedCourseTypes"
ADD CONSTRAINT "_InstructorQualifiedCourseTypes_B_fkey"
FOREIGN KEY ("B") REFERENCES "instructor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
