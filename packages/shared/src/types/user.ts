export const UserTier = {
  FREE: "free",
  PREMIUM: "premium",
} as const;

export type UserTier = (typeof UserTier)[keyof typeof UserTier];

export const OddsFormat = {
  DECIMAL: "decimal",
  AMERICAN: "american",
} as const;

export type OddsFormat = (typeof OddsFormat)[keyof typeof OddsFormat];

export const FREE_TEAM_LIMIT = 3;

export interface TierLimits {
  maxTeams: number;
  reminderIntervals: number[];
  hasOdds: boolean;
  hasDailyDigest: boolean;
  hasUpsetAlerts: boolean;
  hasLineMovement: boolean;
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    maxTeams: FREE_TEAM_LIMIT,
    reminderIntervals: [30, 0],
    hasOdds: false,
    hasDailyDigest: false,
    hasUpsetAlerts: false,
    hasLineMovement: false,
  },
  premium: {
    maxTeams: Infinity,
    reminderIntervals: [60, 30, 15, 5, 0],
    hasOdds: true,
    hasDailyDigest: true,
    hasUpsetAlerts: true,
    hasLineMovement: true,
  },
};
