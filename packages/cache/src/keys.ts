export const CacheKeys = {
  liveMatches: () => "matches:live",
  upcomingMatches: () => "matches:upcoming",
  todayMatches: () => "matches:today",
  matchesByGame: (game: string) => `matches:game:${game}`,
  match: (id: string) => `match:${id}`,
  matchOdds: (matchId: string) => `odds:match:${matchId}`,
  bestOdds: (matchId: string) => `odds:best:${matchId}`,
  teamSearch: (query: string) => `teams:search:${query.toLowerCase()}`,
} as const;

export const CacheTTL = {
  LIVE: 30,
  UPCOMING: 300,
  TODAY: 120,
  ODDS: 60,
  TEAM_SEARCH: 3600,
  DEFAULT: 600,
} as const;
