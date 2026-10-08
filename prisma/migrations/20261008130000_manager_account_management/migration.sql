CREATE TABLE "account_sessions" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("session_id")
);

CREATE INDEX "idx_account_sessions_user_revoked" ON "account_sessions"("user_id", "revoked_at");
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "account_actions" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "account_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_account_actions_target_status" ON "account_actions"("target_id", "status");
CREATE UNIQUE INDEX "uq_account_actions_pending_target" ON "account_actions"("target_id") WHERE "status" IN ('PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED');
CREATE INDEX "idx_account_actions_school_created" ON "account_actions"("school_id", "created_at");
ALTER TABLE "account_actions" ADD CONSTRAINT "account_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_actions" ADD CONSTRAINT "account_actions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_actions" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON "account_sessions" FROM anon;
        REVOKE ALL ON "account_actions" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON "account_sessions" FROM authenticated;
        REVOKE ALL ON "account_actions" FROM authenticated;
    END IF;
END;
$$;
