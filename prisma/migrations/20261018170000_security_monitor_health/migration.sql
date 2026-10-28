CREATE TABLE security_monitor_health (
    component VARCHAR(24) PRIMARY KEY CHECK (component IN ('WRITER', 'DETECTOR')),
    last_success_at TIMESTAMPTZ(3),
    last_failure_at TIMESTAMPTZ(3)
);
ALTER TABLE security_monitor_health ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON security_monitor_health FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON security_monitor_health FROM authenticated;
  END IF;
END $$;
CREATE INDEX idx_security_events_detection_rule_time ON security_events(resource_id, occurred_at)
    WHERE source = 'DETECTOR';
CREATE INDEX idx_security_events_target_time ON security_events(target_user_id, occurred_at)
    WHERE type = 'LOGIN_FAILED';
