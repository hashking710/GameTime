CREATE TYPE "public"."game" AS ENUM('cs2', 'valorant', 'lol', 'dota2', 'rocket_league', 'apex', 'rainbow_six', 'cod', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'ufc', 'f1', 'tennis');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('upcoming', 'live', 'completed');--> statement-breakpoint
CREATE TYPE "public"."odds_market" AS ENUM('moneyline', 'spread', 'total');--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game" "game" NOT NULL,
	"team1" varchar(255) NOT NULL,
	"team2" varchar(255) NOT NULL,
	"team1_score" integer,
	"team2_score" integer,
	"tournament" varchar(255) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"status" "match_status" DEFAULT 'upcoming' NOT NULL,
	"stream_url" varchar(512),
	"source" varchar(50) NOT NULL,
	"source_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"game" "game" NOT NULL,
	"logo_url" varchar(512),
	"source" varchar(50) NOT NULL,
	"source_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"discord_id" varchar(20) PRIMARY KEY NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"premium_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" varchar(20) NOT NULL,
	"team_id" uuid NOT NULL,
	"notify_60min" boolean DEFAULT true NOT NULL,
	"notify_30min" boolean DEFAULT true NOT NULL,
	"notify_15min" boolean DEFAULT false NOT NULL,
	"notify_5min" boolean DEFAULT false NOT NULL,
	"notify_live" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"game" "game" NOT NULL,
	"bookmaker" varchar(100) NOT NULL,
	"market" "odds_market" NOT NULL,
	"team1_odds" real NOT NULL,
	"team2_odds" real NOT NULL,
	"draw_odds" real,
	"spread_value" real,
	"total_value" real,
	"over_odds" real,
	"under_odds" real,
	"source" varchar(50) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odds_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"bookmaker" varchar(100) NOT NULL,
	"market" "odds_market" NOT NULL,
	"team1_odds" real NOT NULL,
	"team2_odds" real NOT NULL,
	"draw_odds" real,
	"spread_value" real,
	"total_value" real,
	"over_odds" real,
	"under_odds" real,
	"source" varchar(50) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_discord_id_users_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds" ADD CONSTRAINT "odds_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_history" ADD CONSTRAINT "odds_history_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "matches_source_source_id_idx" ON "matches" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "matches_game_status_idx" ON "matches" USING btree ("game","status");--> statement-breakpoint
CREATE INDEX "matches_start_time_idx" ON "matches" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_source_source_id_idx" ON "teams" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sub_discord_team_idx" ON "user_subscriptions" USING btree ("discord_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "odds_match_book_market_idx" ON "odds" USING btree ("match_id","bookmaker","market");--> statement-breakpoint
CREATE INDEX "odds_match_id_idx" ON "odds" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "odds_history_match_id_idx" ON "odds_history" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "odds_history_fetched_at_idx" ON "odds_history" USING btree ("fetched_at");