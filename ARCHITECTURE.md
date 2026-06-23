# GameTime — Multi-Stack Architecture

## Overview

GameTime runs as 4 independent Docker Compose stacks that communicate through shared PostgreSQL and Redis instances. Each stack can be deployed, scaled, and updated independently.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL TRAFFIC                             │
│   Discord API    Ko-fi Webhooks    Users (Web)    Data APIs         │
└──────┬──────────────┬──────────────────┬────────────┬───────────────┘
       │              │                  │            │
       ▼              ▼                  ▼            │
┌──────────────┐ ┌─────────┐  ┌──────────────────┐   │
│  Stack 2:    │ │ Stack 4: │  │   Stack 5:       │   │
│  Discord Bot │ │ Reverse  │  │   Web Portal     │   │
│  + Webhook   │ │ Proxy    │  │   (WordPress)    │   │
└──────┬───────┘ └────┬────┘  └────────┬─────────┘   │
       │              │                │              │
       ▼              ▼                ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Stack 1: INFRASTRUCTURE                         │
│                                                                     │
│   ┌──────────────┐        ┌──────────────┐                         │
│   │  PostgreSQL   │        │    Redis      │                        │
│   │  (all data)   │        │  (cache)      │                        │
│   └──────────────┘        └──────────────┘                         │
│                                                                     │
└──────────────────────────────────────────────────────────────────────┘
       ▲              ▲                ▲              ▲
       │              │                │              │
┌──────┴──────────────┴────────────────┴──────────────┴───────────────┐
│                     Stack 3: COLLECTORS                              │
│                                                                     │
│  ┌─────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐          │
│  │ PandaScore  │ │ OpenDota │ │ SportsDB  │ │   Odds   │          │
│  │ (esports)   │ │ (Dota 2) │ │ + ESPN    │ │ Collector│          │
│  └─────────────┘ └──────────┘ └───────────┘ └──────────┘          │
│  ┌─────────────┐                                                   │
│  │  Reminder   │                                                   │
│  │  + Alerts   │                                                   │
│  └─────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stack 1: Infrastructure

**Purpose:** Shared data layer for all other stacks.

**Services:**
- `postgres` — PostgreSQL 16, persistent volume, healthcheck
- `redis` — Redis 7, persistent volume, healthcheck

**Network:** Creates a named Docker network (`gametime-infra`) that other stacks join.

**Ports:**
- Postgres: 5432 (internal only, no host binding in production)
- Redis: 6379 (internal only)

```yaml
# docker-compose.infra.yml
name: gametime-infra

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: gametime
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: gametime
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gametime"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - gametime

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - gametime

volumes:
  pg_data:
  redis_data:

networks:
  gametime:
    name: gametime
    driver: bridge
```

**Why separate:** Infrastructure outlives application deployments. You can redeploy the bot or collectors without touching the database. Backups, scaling, and maintenance happen independently.

---

## Stack 2: Discord Bot

**Purpose:** Handles all Discord interactions and Ko-fi payment webhooks.

**Services:**
- `bot` — Discord.js bot with 11 slash commands
- Embeds the Ko-fi webhook server on port 3000

**Connects to:** Stack 1 (postgres + redis) via the shared `gametime` network.

**Exposed ports:**
- 3000 (Ko-fi webhook — routed through reverse proxy)

```yaml
# docker-compose.bot.yml
name: gametime-bot

services:
  bot:
    build:
      context: .
      dockerfile: packages/bot/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://gametime:${DB_PASSWORD}@postgres:5432/gametime
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      NODE_ENV: production
    networks:
      - gametime

networks:
  gametime:
    external: true
```

**Communication pattern:**
- **Reads** from PostgreSQL (matches, teams, users, subscriptions, odds)
- **Reads** from Redis (cached query results)
- **Writes** to PostgreSQL (user creation, subscriptions, premium status via Ko-fi webhook)
- **Receives** HTTP POST from Ko-fi (payment notifications)
- **Sends** to Discord API (embeds, DMs, command responses)

---

## Stack 3: Collectors + Reminder

**Purpose:** All background data collection, match lifecycle management, and notification delivery.

**Services:**
- `collector-pandascore` — CS2, Valorant, LoL, Dota 2 matches (every 5 min)
- `collector-opendota` — Dota 2 pro matches + live (every 5 min)
- `collector-sportsdb` — Traditional sports schedules (every 15 min) + ESPN live scores (every 2 min)
- `collector-odds` — PandaScore odds (5 min), TheOddsAPI (6 hrs), Pinnacle (15 min)
- `reminder` — Match reminders (every 1 min), upset alerts (every 2 min), line movement alerts (every 10 min), daily digest (8 AM UTC)
- `migrate` — One-shot migration runner (runs then exits)

**Connects to:** Stack 1 (postgres + redis) via the shared `gametime` network.

```yaml
# docker-compose.collectors.yml
name: gametime-collectors

services:
  migrate:
    build:
      context: .
      dockerfile: packages/db/Dockerfile
    environment:
      DATABASE_URL: postgresql://gametime:${DB_PASSWORD}@postgres:5432/gametime
    restart: "no"
    networks:
      - gametime

  collector-pandascore:
    build:
      context: .
      dockerfile: packages/collectors/hltv/Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://gametime:${DB_PASSWORD}@postgres:5432/gametime
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      PANDASCORE_API_KEY: ${PANDASCORE_API_KEY}
      NODE_ENV: production
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks:
      - gametime

  collector-opendota:
    # ... same pattern

  collector-sportsdb:
    # ... same pattern, plus SPORTSDB_API_KEY

  collector-odds:
    # ... same pattern, plus PANDASCORE_API_KEY + ODDS_API_KEY

  reminder:
    build:
      context: .
      dockerfile: packages/reminder/Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://gametime:${DB_PASSWORD}@postgres:5432/gametime
      DISCORD_TOKEN: ${DISCORD_TOKEN}
      NODE_ENV: production
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks:
      - gametime

networks:
  gametime:
    external: true
```

**Communication pattern:**
- **Writes** to PostgreSQL (matches, teams, odds, odds_history)
- **Writes** to Redis (cache invalidation after ingestion)
- **Reads** from external APIs (PandaScore, OpenDota, ESPN, TheSportsDB, TheOddsAPI, Pinnacle)
- **Reads** from PostgreSQL (reminder: user subscriptions, match times)
- **Sends** to Discord API (reminder: DM notifications for reminders, alerts, digests)

---

## Stack 4: Reverse Proxy

**Purpose:** SSL termination, domain routing, and rate limiting.

**Services:**
- `traefik` or `nginx` — Routes external traffic to the bot webhook and web portal

**Routes:**
- `gametime.yourdomain.com` → Stack 5 (WordPress web portal, port 80)
- `gametime.yourdomain.com/api/kofi` → Stack 2 (bot webhook, port 3000)
- `gametime.yourdomain.com/api/*` → Stack 5 (future REST API)

```yaml
# docker-compose.proxy.yml
name: gametime-proxy

services:
  traefik:
    image: traefik:v3.0
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt
    networks:
      - gametime

volumes:
  letsencrypt:

networks:
  gametime:
    external: true
```

---

## Stack 5: Web Portal (Future)

**Purpose:** Public-facing website for match schedules, odds dashboard, user account management, and premium subscription handling.

**Services:**
- `wordpress` — WordPress with custom GameTime plugin
- `wp-db` — Separate MySQL for WordPress CMS content (or share postgres via plugin)

**Or alternatively:**
- `portal` — Next.js/Astro app reading directly from the GameTime PostgreSQL

**Communication pattern:**
- **Reads** from PostgreSQL (matches, odds, teams — same data the bot uses)
- **Writes** to PostgreSQL (user settings, subscription management)
- **Receives** HTTP from users (web browser)
- **Receives** HTTP from Ko-fi (alternative webhook endpoint)
- **Serves** static pages + dynamic match data

### WordPress Plugin Approach

Since you can write WordPress plugins, the portal can work like this:

```
WordPress Site (your existing domain)
  └── GameTime Plugin
        ├── Shortcodes: [gametime_today], [gametime_live], [gametime_schedule game="nfl"]
        ├── REST API: /wp-json/gametime/v1/matches, /odds, /teams
        ├── Admin Panel: manage team aliases, view subscriber stats
        ├── Ko-fi Webhook Handler: /wp-json/gametime/v1/kofi
        │     └── Receives payment → calls GameTime PostgreSQL to set premium
        └── User Dashboard: /my-gametime/
              ├── Tracked teams (synced with Discord via discord_id)
              ├── Odds preferences
              ├── Notification settings
              └── Subscription management
```

The WordPress plugin connects directly to the GameTime PostgreSQL database (same one the bot uses) via a PHP PostgreSQL driver or a lightweight REST API that sits in front of it.

**Option A: Direct DB connection from WordPress**
```php
// wp-content/plugins/gametime/includes/db.php
$gametime_db = pg_connect("host=postgres dbname=gametime user=gametime password=...");
$matches = pg_query($gametime_db, "SELECT * FROM matches WHERE status = 'live'");
```

**Option B: REST API microservice (recommended)**
A tiny Express/Fastify service in the GameTime monorepo that exposes a read-only REST API:
```
GET /api/matches?status=live&game=nfl
GET /api/matches/:id/odds
GET /api/teams?search=denver
GET /api/user/:discordId/subscriptions
POST /api/kofi (webhook)
```

WordPress calls this API. This keeps the database access pattern clean and avoids giving WordPress direct postgres credentials.

---

## Data Flow Diagram

```
                    ┌─────────────┐
                    │  PandaScore  │
                    │  OpenDota    │
                    │  ESPN        │──── fetch ────┐
                    │  TheSportsDB │               │
                    │  TheOddsAPI  │               │
                    │  Pinnacle    │               │
                    └─────────────┘               │
                                                  ▼
┌──────────┐    ┌────────────────────┐    ┌───────────────┐
│  Ko-fi   │───▶│  Bot Webhook       │    │  Collectors   │
│  Payment │    │  (port 3000)       │    │  (5 services) │
└──────────┘    └────────┬───────────┘    └───────┬───────┘
                         │                        │
                    set premium              upsert matches
                    create user              upsert teams
                         │                   upsert odds
                         ▼                        ▼
                ┌─────────────────────────────────────────┐
                │            PostgreSQL                    │
                │                                         │
                │  matches (300+)    odds (900+)          │
                │  teams (474+)      odds_history         │
                │  users             user_subscriptions   │
                │  team_aliases                           │
                ├─────────────────────────────────────────┤
                │            Redis                        │
                │                                         │
                │  matches:live     matches:today         │
                │  matches:upcoming odds:match:*          │
                │  matches:game:*   teams:search:*        │
                └──────────┬──────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
        ┌──────────┐ ┌──────────┐   ┌──────────────┐
        │ Discord  │ │ Reminder │   │  Web Portal   │
        │   Bot    │ │ Service  │   │  (WordPress)  │
        │          │ │          │   │               │
        │ /today   │ │ DMs at   │   │ Live scores   │
        │ /live    │ │ 60/30/15 │   │ Odds dashboard│
        │ /odds    │ │ /5/0 min │   │ Team pages    │
        │ /track   │ │          │   │ User accounts │
        │ /schedule│ │ Upset    │   │ Subscription  │
        │ /help    │ │ alerts   │   │ management    │
        │ etc.     │ │          │   │               │
        └────┬─────┘ │ Line     │   └───────┬───────┘
             │       │ movement │           │
             ▼       │ alerts   │           ▼
        ┌──────────┐ │          │   ┌──────────────┐
        │ Discord  │ │ Daily    │   │   Browser    │
        │ Server   │ │ digest   │   │   Users      │
        └──────────┘ └────┬─────┘   └──────────────┘
                          │
                          ▼
                    ┌──────────┐
                    │ Discord  │
                    │ DMs      │
                    └──────────┘
```

---

## Deployment Order

1. **Stack 1 (Infrastructure)** — Start first, wait for healthchecks
2. **Stack 3 (Collectors)** — Migration runs, then collectors start ingesting
3. **Stack 2 (Bot)** — Connects to populated database, registers commands
4. **Stack 4 (Proxy)** — Routes traffic to bot webhook + portal
5. **Stack 5 (Portal)** — When ready, connects to same database

## Scaling Strategy

| Component | Scale Strategy |
|-----------|---------------|
| PostgreSQL | Vertical (bigger instance) or read replicas |
| Redis | Vertical, or Redis Cluster for >10K concurrent users |
| Bot | Single instance (Discord gateway = 1 connection per bot) |
| Collectors | Single instance each (rate-limited by APIs anyway) |
| Reminder | Single instance (avoids duplicate notifications) |
| Web Portal | Horizontal (multiple WordPress containers behind load balancer) |
| Proxy | Single instance (Traefik handles high throughput) |

## Environment Variables

All stacks share these core variables (stored in a single `.env` file or secrets manager):

```env
# Shared
DB_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
DATABASE_URL=postgresql://gametime:${DB_PASSWORD}@postgres:5432/gametime
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# Bot-specific
DISCORD_TOKEN=<token>
DISCORD_CLIENT_ID=<id>
DISCORD_GUILD_ID=<id>
KOFI_VERIFICATION_TOKEN=<token>
KOFI_URL=https://ko-fi.com/yourpage

# Collector-specific
PANDASCORE_API_KEY=<key>
ODDS_API_KEY=<key>
SPORTSDB_API_KEY=3

# Proxy-specific
ACME_EMAIL=you@example.com
DOMAIN=gametime.yourdomain.com
```

## Ko-fi + WordPress Payment Flow

```
User runs /subscribe in Discord
  └── Bot shows Premium features + Ko-fi link + user's Discord ID
        └── User clicks "Subscribe on Ko-fi" button
              └── Ko-fi checkout page ($4.99/month)
                    └── User pastes Discord ID in message field
                          └── Payment completes
                                └── Ko-fi sends webhook POST
                                      │
                                      ├── Route A: Bot webhook (current)
                                      │     └── POST /kofi on bot:3000
                                      │           └── Parse Discord ID from message
                                      │                 └── UPDATE users SET premium=true
                                      │                       └── DM user "Welcome to Premium!"
                                      │
                                      └── Route B: WordPress plugin (future)
                                            └── POST /wp-json/gametime/v1/kofi
                                                  └── WordPress plugin validates token
                                                        └── Calls GameTime DB or API
                                                              └── Sets premium=true
                                                              └── Sends confirmation email
                                                              └── Updates WordPress user profile
```

Both routes can coexist — Ko-fi supports multiple webhook URLs, so the bot gets notified (for the Discord DM) and WordPress gets notified (for the web dashboard update) simultaneously.

## What This Enables

1. **Deploy bot updates** without touching collectors or database
2. **Scale collectors** independently based on API rate limits
3. **Add the web portal** without modifying any existing services
4. **Replace WordPress** with Next.js later without touching the bot
5. **Move to managed PostgreSQL** (RDS, Supabase) by changing one env var
6. **Add new data sources** by adding a new collector container
7. **Run locally** with a single combined docker-compose.yml (current setup)
8. **Run in production** with separate stacks on the same Docker network
