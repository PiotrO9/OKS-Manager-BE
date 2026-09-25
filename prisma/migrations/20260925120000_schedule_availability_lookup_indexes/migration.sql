CREATE INDEX "idx_instructor_time_blocks_instructor_start"
ON "instructor_time_blocks"("instructor_id", "start_time");

CREATE INDEX "idx_instructor_leaves_instructor_range"
ON "instructor_leaves"("instructor_id", "start_date", "end_date");
