# GameTime Roadmap

## Current State (v1.0)

GameTime is a Discord bot tracking 16 games across esports and traditional sports with live scores, betting odds, match reminders, and a freemium subscription model.

**Shipped:**
- 12 slash commands with pagination, dedup, rate limiting
- 6 data sources (PandaScore, OpenDota, ESPN, TheSportsDB, TheOddsAPI, Pinnacle)
- Auto-updating live embeds with map/period scores and team logos
- Odds from 9+ bookmakers with American/decimal toggle
- Freemium tier ($4.99/mo via Ko-fi) with team tracking limits, odds gating, and premium alerts
- Daily digest, upset alerts, line movement alerts
- Team alias deduplication, timezone-aware notifications, quiet hours
- Full Docker Compose deployment

---

## Phase 2: Web Foundation (Q4 2026 - Q1 2027)

Build a separate GameTime-owned web experience on its own domain. Keep the first release focused on the lowest-risk, highest-value account workflows.

### User-Facing Features
- **Match Hub** — Live scores, upcoming schedules, and results in a clean web UI. Filterable by game, date, and league.
- **My Teams** — Visual team management. Track/untrack teams, see upcoming matches for followed teams, notification history.
- **Account Settings** — Timezone, odds format, quiet hours, muted games, favorite teams/leagues. Changes sync to Discord when possible.
- **Subscription Status** — Premium visibility, payment links, and handoff to the payment provider for anything beyond status display.

### Integration Layer
- REST API service reading from the shared PostgreSQL database
- Separate GameTime domain or subdomain, independent from the HKR website
- HKR stays unrelated except as a portfolio/payment portal if needed
- Discord account linking via OAuth2 (user connects their Discord to their web account)
- Unified profile where practical, but Discord remains the primary surface

### Technical Implementation
- REST API: `/api/matches`, `/api/teams`, `/api/user`, `/api/subscribe`
- Payment webhook endpoint for subscription events, if and when a dedicated billing flow exists
- Session management with Discord OAuth2 tokens
- Runs as a separate Docker stack with its own domain routing

---

## Phase 3: Bot + Web Expansion (Q3 2027)

### Bot Enhancements
- `/tournament` command — Follow entire tournaments (IEM Cologne, Worlds, Super Bowl playoffs)
- Tournament bracket visualization in embeds
- Auto-track all matches in a followed tournament
- Tournament results and standings

### Web Expansion
- Odds dashboard with side-by-side bookmaker comparison
- Historical line charts and best-available line summaries
- Roster and player profiles for a few high-value games first
- Per-server settings and role-based notifications

### Match Predictions
- Community predictions — users vote on match outcomes before they start
- Prediction accuracy leaderboard per server
- Optional integration with odds to show implied probabilities

---

## Phase 4: Social & Community (Q1 2028)

### Watch Parties
- `/watchparty` command — Create a watch party for an upcoming match
- RSVP system with reminders
- Voice channel integration — auto-create or name a VC for the match

### Fantasy Integration
- Weekly fantasy picks for followed games
- Points based on real match outcomes
- Server leaderboards and seasonal rankings
- No real-money wagering (compliance-safe)

### Personalized Feed
- Smart match recommendations based on tracking history and viewing patterns
- "Matches you might like" suggestions
- Trending matches across all GameTime users

---

## Phase 5: Platform Expansion (2028+)

### Mobile App
- Mobile app is a later-stage possibility, not a core near-term commitment
- If pursued, it should start with a read-only companion app before attempting full account management or push notifications
- Reuse the shared backend and APIs only after the web foundation is stable

### Twitch/YouTube Integration
- Auto-detect when a tracked match has a live stream
- Stream viewer count in match embeds
- Clip highlights linked to match timeline events

### API for Third Parties
- Public API for match data, odds, and schedules
- Rate-limited free tier, paid tiers for commercial use
- Developer documentation and API keys

### Additional Games
- Expand based on user demand
- Overwatch 2, PUBG, Smash, fighting games
- College sports (NCAA basketball, football)
- Cricket, rugby, F1 qualifying sessions

---

## Revenue Roadmap

| Phase | Revenue Stream | Pricing |
|-------|---------------|---------|
| v1.0 (Now) | Premium subscriptions via Ko-fi | $4.99/mo |
| Phase 2 | Web Premium access (same subscription, web + Discord) | $4.99/mo |
| Phase 3 | Server Premium (per-server features) | $9.99/mo per server |
| Phase 4 | Fantasy league entry (optional) | $1.99/season |
| Phase 5 | API access for developers | $19.99/mo (10K req/day) |

### Revenue Strategy
- Keep the free tier generous — most users never pay, and that's fine. They bring friends.
- Premium is about convenience and depth, not paywalling core features.
- Server Premium targets community owners who want a dedicated match feed.
- API access is a low-effort, high-margin revenue stream once the data pipeline is mature.
- Treat mobile as optional upside, not a promised revenue driver.

---

## Technical Debt & Infrastructure

### Near-Term (Before Phase 2)
- [ ] Automated database backups
- [ ] CI/CD pipeline (GitHub Actions → Docker Hub)
- [ ] Monitoring stack (Prometheus + Grafana)
- [ ] Integration tests for collectors and reminder logic

### Medium-Term (Before Phase 3)
- [ ] Read replicas for PostgreSQL (separate bot reads from collector writes)
- [ ] CDN for team logos and static assets
- [ ] Error tracking (Sentry)
- [ ] Rate limiting at the API gateway level

### Long-Term (Before Phase 5)
- [ ] Multi-region deployment
- [ ] Event-driven architecture (replace polling with webhooks where available)
- [ ] ML-based match recommendations
- [ ] Data warehouse for analytics and trend analysis
