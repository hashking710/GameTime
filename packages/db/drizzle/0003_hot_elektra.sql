CREATE TABLE "team_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias" varchar(255) NOT NULL,
	"canonical_name" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "canonical_name" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "team_aliases_alias_idx" ON "team_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "team_aliases_canonical_idx" ON "team_aliases" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "teams_canonical_name_idx" ON "teams" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "teams_name_game_idx" ON "teams" USING btree ("name","game");