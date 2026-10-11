-- Prevent a dependent row from being created while a course is being soft-deleted.
-- FOR SHARE blocks on the course row lock held by the delete transaction.
CREATE OR REPLACE FUNCTION assert_course_is_active_for_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  course_deleted_at timestamptz;
BEGIN
  IF NEW.course_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT deleted_at INTO course_deleted_at
  FROM courses WHERE id = NEW.course_id FOR SHARE;

  IF NOT FOUND OR course_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Course is unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_course_participant_reference
BEFORE INSERT OR UPDATE OF course_id ON course_participants
FOR EACH ROW EXECUTE FUNCTION assert_course_is_active_for_reference();

CREATE TRIGGER guard_course_lesson_reference
BEFORE INSERT OR UPDATE OF course_id ON lessons
FOR EACH ROW EXECUTE FUNCTION assert_course_is_active_for_reference();

CREATE TRIGGER guard_course_event_reference
BEFORE INSERT OR UPDATE OF course_id ON instructor_events
FOR EACH ROW EXECUTE FUNCTION assert_course_is_active_for_reference();

CREATE TRIGGER guard_course_payment_plan_reference
BEFORE INSERT OR UPDATE OF course_id ON payment_plans
FOR EACH ROW EXECUTE FUNCTION assert_course_is_active_for_reference();
