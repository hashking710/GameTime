ALTER TABLE "users" ADD COLUMN "quiet_hours_start" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_hours_end" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "muted_games" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "favorite_teams" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "favorite_leagues" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX "matches_status_start_time_idx" ON "matches" USING btree ("status","start_time");
--> statement-breakpoint
CREATE INDEX "matches_game_start_time_idx" ON "matches" USING btree ("game","start_time");
--> statement-breakpoint
CREATE INDEX "odds_match_market_idx" ON "odds" USING btree ("match_id","market");
--> statement-breakpoint
CREATE INDEX "odds_history_match_book_market_fetched_idx" ON "odds_history" USING btree ("match_id","bookmaker","market","fetched_at");
