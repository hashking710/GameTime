export function collectMissingSubscriptionTeamIds(
  variantTeamIds: string[],
  existingTeamIds: Iterable<string>,
): string[] {
  const existingSet = new Set(existingTeamIds);
  return variantTeamIds.filter((teamId) => !existingSet.has(teamId));
}
