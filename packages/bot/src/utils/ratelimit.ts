const userCooldowns = new Map<string, Map<string, number>>();

const COOLDOWN_MS: Record<string, number> = {
  live: 15_000,
  today: 5_000,
  upcoming: 5_000,
  schedule: 5_000,
  odds: 5_000,
  track: 3_000,
  untrack: 3_000,
  results: 5_000,
};

export function checkRateLimit(
  userId: string,
  command: string,
): string | null {
  const cooldown = COOLDOWN_MS[command] ?? 3_000;
  const now = Date.now();

  let userMap = userCooldowns.get(userId);
  if (!userMap) {
    userMap = new Map();
    userCooldowns.set(userId, userMap);
  }

  const lastUsed = userMap.get(command) ?? 0;
  const remaining = cooldown - (now - lastUsed);

  if (remaining > 0) {
    return `Please wait ${Math.ceil(remaining / 1000)}s before using \`/${command}\` again.`;
  }

  userMap.set(command, now);
  return null;
}

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [userId, commands] of userCooldowns) {
    for (const [cmd, time] of commands) {
      if (time < cutoff) commands.delete(cmd);
    }
    if (commands.size === 0) userCooldowns.delete(userId);
  }
}, 60_000);
