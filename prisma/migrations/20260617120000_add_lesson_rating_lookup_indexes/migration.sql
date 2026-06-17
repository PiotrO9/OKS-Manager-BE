CREATE INDEX "idx_lesson_ratings_instructor_id_created_at"
ON "lesson_ratings"("instructor_id", "created_at");

CREATE INDEX "idx_lesson_ratings_student_id_created_at"
ON "lesson_ratings"("student_id", "created_at");
