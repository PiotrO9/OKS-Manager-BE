CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" VARCHAR(64) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "reason_code" VARCHAR(64),
    "operation_code" VARCHAR(96),
    "operation_label_snapshot" VARCHAR(160),
    "http_method" VARCHAR(8),
    "route_template" VARCHAR(180),
    "http_status" INTEGER,
    "actor_user_id" UUID,
    "actor_role_snapshot" VARCHAR(24),
    "actor_display_name_snapshot" VARCHAR(160),
    "target_user_id" UUID,
    "target_display_name_snapshot" VARCHAR(160),
    "resource_type" VARCHAR(48),
    "resource_id" VARCHAR(100),
    "login_identifier_hash" VARCHAR(64),
    "hash_key_version" VARCHAR(24),
    "login_identifier_masked" VARCHAR(100),
    "client_ip" VARCHAR(45),
    "ip_source" VARCHAR(24),
    "user_agent" VARCHAR(256),
    "request_id" VARCHAR(100),
    "attempt_id" VARCHAR(100) NOT NULL,
    "event_phase" VARCHAR(48) NOT NULL DEFAULT 'RESULT',
    "source" VARCHAR(32) NOT NULL,
    "source_event_id" VARCHAR(100),
    "account_action_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_security_events_source_attempt_phase" ON "security_events"("source", "attempt_id", "event_phase");
CREATE INDEX "idx_security_events_time" ON "security_events"("occurred_at" DESC, "id" DESC);
CREATE INDEX "idx_security_events_type_time" ON "security_events"("type", "occurred_at" DESC);
CREATE INDEX "idx_security_events_login_time" ON "security_events"("login_identifier_hash", "occurred_at" DESC);
CREATE INDEX "idx_security_events_ip_time" ON "security_events"("client_ip", "occurred_at" DESC);
CREATE UNIQUE INDEX "uq_security_events_account_action_phase" ON "security_events"("account_action_id", "event_phase") WHERE "account_action_id" IS NOT NULL;

CREATE TABLE "security_event_schools" (
    "event_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "viewer_user_id" UUID,
    "actor_visibility" VARCHAR(12) NOT NULL,
    "actor_user_id" UUID,
    "actor_display_name" VARCHAR(160),
    "actor_role" VARCHAR(24),
    "target_user_id" UUID,
    "target_display_name" VARCHAR(160),
    CONSTRAINT "security_event_schools_pkey" PRIMARY KEY ("event_id", "school_id"),
    CONSTRAINT "security_event_schools_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "security_events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "security_event_schools_visibility_check" CHECK ("actor_visibility" IN ('KNOWN', 'UNKNOWN', 'EXTERNAL')),
    CONSTRAINT "security_event_schools_external_check" CHECK ("actor_visibility" <> 'EXTERNAL' OR ("actor_user_id" IS NULL AND "actor_role" IS NULL AND "actor_display_name" = 'Użytkownik zewnętrzny'))
);

CREATE INDEX "idx_security_event_schools_list" ON "security_event_schools"("school_id", "occurred_at" DESC, "event_id" DESC);
CREATE INDEX "idx_security_event_schools_actor" ON "security_event_schools"("school_id", "actor_user_id");
CREATE INDEX "idx_security_event_schools_target" ON "security_event_schools"("school_id", "target_user_id");

CREATE TABLE "security_detection_states" (
    "rule" VARCHAR(24) NOT NULL,
    "scope_key" VARCHAR(100) NOT NULL,
    "subject_key" VARCHAR(100) NOT NULL,
    "key_version" VARCHAR(24) NOT NULL,
    "queued_generation" INTEGER NOT NULL DEFAULT 0,
    "done_generation" INTEGER NOT NULL DEFAULT 0,
    "next_eligible_at" TIMESTAMPTZ(3),
    "last_processed_at" TIMESTAMPTZ(3),
    "last_processed_event_id" UUID,
    "last_active_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_detection_states_pkey" PRIMARY KEY ("rule", "scope_key", "subject_key", "key_version")
);
CREATE INDEX "idx_security_detection_pending" ON "security_detection_states"("done_generation", "queued_generation", "last_active_at");

CREATE FUNCTION reject_security_event_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Security event history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER security_events_no_update BEFORE UPDATE ON "security_events"
  FOR EACH ROW EXECUTE FUNCTION reject_security_event_update();
CREATE TRIGGER security_event_schools_no_update BEFORE UPDATE ON "security_event_schools"
  FOR EACH ROW EXECUTE FUNCTION reject_security_event_update();

ALTER TABLE "security_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_event_schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_detection_states" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "security_events", "security_event_schools", "security_detection_states" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "security_events", "security_event_schools", "security_detection_states" FROM authenticated;
  END IF;
END $$;
