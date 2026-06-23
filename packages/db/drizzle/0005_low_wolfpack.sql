CREATE TABLE IF NOT EXISTS "match_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"match_id" uuid NOT NULL,
	"notify_live" boolean DEFAULT true NOT NULL,
	"notify_completed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "match_watches" ADD CONSTRAINT "match_watches_discord_id_users_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."users"("discord_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "match_watches" ADD CONSTRAINT "match_watches_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "match_watches_user_match_idx" ON "match_watches" USING btree ("discord_id","match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_status_start_time_idx" ON "matches" USING btree ("status","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_game_start_time_idx" ON "matches" USING btree ("game","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "odds_match_market_idx" ON "odds" USING btree ("match_id","market");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "odds_history_match_book_market_fetched_idx" ON "odds_history" USING btree ("match_id","bookmaker","market","fetched_at");
