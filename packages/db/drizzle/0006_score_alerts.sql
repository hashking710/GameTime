ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_score_updates" boolean DEFAULT true NOT NULL;
