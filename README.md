# GameTime

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/L5F821TQO2)

A Discord bot for esports and traditional sports match tracking, live scores, betting odds, and notifications.

![Discord](https://img.shields.io/badge/Discord.js-v14-5865F2?logo=discord&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-BSL%201.1-blue)

## What It Does

GameTime tracks matches across **16 games**, aggregates odds from **9+ bookmakers**, and delivers live scores with auto-updating Discord embeds.

**Esports:** CS2, Valorant, League of Legends, Dota 2, Rocket League, Apex, Rainbow Six, COD

**Sports:** NFL, NBA, MLB, NHL, Soccer (World Cup, EPL, La Liga, Serie A, Bundesliga, UCL, MLS, Liga MX), UFC, F1, Tennis

### Features

- **Live scores** — Auto-updating embeds with map/period breakdowns, refreshing every 30 seconds
- **Match schedules** — Today's games, upcoming matches, full schedules filtered by game
- **Team tracking** — Follow teams across games and get DM notifications before their matches
- **Betting odds** — Moneyline, spreads, and totals from FanDuel, DraftKings, BetOnline, and more
- **Odds format toggle** — Switch between American (-110) and Decimal (1.91)
- **Team logos** — Esports team logos displayed in embeds
- **Upset alerts** — Get notified when a heavy underdog is winning live
- **Line movement alerts** — Know when odds shift significantly
- **Daily digest** — Morning DM with your tracked teams' schedule
- **Freemium model** — Free tier with 3 teams + basic reminders, Premium ($4.99/mo) for odds, unlimited tracking, and alerts

### Bot Commands

| Command | Description | Tier |
|---------|-------------|------|
| `/today` | Today's matches across all sports | Free |
| `/upcoming` | Upcoming matches with game filter dropdown | Free |
| `/live` | Live matches with auto-updating scores + pagination | Free |
| `/schedule` | Full schedule for a specific game | Free |
| `/track` | Follow a team (autocomplete search) | Free (3) / Premium (∞) |
| `/untrack` | Stop following a team | Free |
| `/odds` | Odds from multiple bookmakers | Premium |
| `/settings` | Toggle odds format (decimal/american) | Free |
| `/subscribe` | Premium info + Ko-fi link | Free |
| `/tier` | Check your current plan | Free |
| `/help` | Full feature overview | Free |

## Data Sources

| Source | Covers | Rate |
|--------|--------|------|
| [PandaScore](https://pandascore.co) | CS2, Valorant, LoL, Dota 2 matches + esports odds | Every 5 min |
| [OpenDota](https://www.opendota.com) | Dota 2 pro matches + live games | Every 5 min |
| [TheSportsDB](https://www.thesportsdb.com) | NFL, NBA, MLB, NHL, Soccer, UFC schedules | Every 15 min |
| [ESPN](https://www.espn.com) | Live scores with period/inning/quarter breakdowns | Every 2 min |
| [The Odds API](https://the-odds-api.com) | Traditional sports odds from 20+ bookmakers | Every 6 hours |
| [Pinnacle](https://www.pinnacle.com) | Supplemental odds (public feed) | Every 15 min |

## Architecture

```
Discord Bot ──→ PostgreSQL + Redis ←── Collectors (PandaScore, OpenDota, ESPN, SportsDB)
                                   ←── Odds Collector (TheOddsAPI, PandaScore, Pinnacle)
                                   ←── Reminder Service (DMs, alerts, digest)
```

The bot **never calls external APIs** — it reads from PostgreSQL and Redis only. Collectors run as separate services, normalizing all sources into a unified match schema. This means the bot responds instantly and any data source can be swapped without touching bot code.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full multi-stack deployment design.

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- A [Discord bot token](https://discord.com/developers/applications)

### Setup

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/GameTime.git
cd GameTime

# Configure
cp .env.example .env
# Edit .env with your Discord token and API keys

# Start infrastructure
docker compose up postgres redis -d

# Install and build
corepack pnpm install
corepack pnpm --filter @gametime/shared build
corepack pnpm --filter @gametime/db build
corepack pnpm --filter @gametime/cache build
corepack pnpm --filter @gametime/collector-base build

# Run migrations
corepack pnpm db:migrate

# Seed team aliases
corepack pnpm db:seed-aliases

# Register Discord commands
corepack pnpm deploy-commands

# Start the bot
corepack pnpm dev:bot
```

### Docker (Full Stack)

```bash
cp .env.example .env
# Edit .env with your credentials

docker compose up -d --build
```

This starts **8 containers**: PostgreSQL, Redis, migrations, Discord bot, PandaScore collector, OpenDota collector, SportsDB + ESPN collector, odds collector, and the reminder service.

## Project Structure

```
packages/
  shared/          — Types, logger, env loader, validation schemas, constants
  db/              — Drizzle ORM schema, migrations, client
  cache/           — Redis client, cache keys, getOrSet helper
  bot/             — Discord.js bot, 11 slash commands, Ko-fi webhook
  collectors/
    base/          — Abstract BaseCollector (ingest, team upsert, lifecycle)
    hltv/          — PandaScore esports collector (CS2, Val, LoL, Dota 2)
    opendota/      — Dota 2 pro matches (OpenDota API)
    sportsdb/      — Traditional sports schedules + ESPN live scores
    odds/          — Odds from PandaScore, TheOddsAPI, Pinnacle
  reminder/        — Match reminders, upset alerts, line movement alerts, daily digest
```

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict, ESM)
- **Bot:** Discord.js v14
- **Database:** PostgreSQL 16 + Drizzle ORM
- **Cache:** Redis 7 + ioredis
- **Payments:** Ko-fi webhooks
- **Deployment:** Docker Compose
- **Monorepo:** pnpm workspaces

## License

This project is licensed under the [Business Source License 1.1](LICENSE).

You may use, modify, and self-host GameTime for personal and non-commercial purposes. Commercial use as a competing service is restricted until the change date (June 22, 2030), after which the license converts to Apache 2.0.

## Support

If you find GameTime useful, consider supporting development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/L5F821TQO2)
