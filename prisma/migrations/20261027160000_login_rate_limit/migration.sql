-- CreateTable
CREATE TABLE "login_rate_limit_buckets" (
    "key" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "login_rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "login_rate_limit_buckets_expires_at_idx" ON "login_rate_limit_buckets"("expires_at");

ALTER TABLE "login_rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "login_rate_limit_buckets" FROM PUBLIC, anon, authenticated;
ALTER TABLE "login_rate_limit_buckets" ADD CONSTRAINT "login_rate_limit_attempts_positive" CHECK ("attempts" > 0);
