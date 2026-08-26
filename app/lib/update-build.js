/**
 * Normalize a Git commit/build identifier before comparing the installed app
 * with the rolling GitHub release manifest.
 *
 * @param {unknown} value
 */
export function normalizeBuildId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * A matching immutable build ID is authoritative. The timestamp fallback only
 * prevents a locally built app that is newer than the published manifest from
 * being offered an older release.
 *
 * @param {{currentBuildId: unknown, currentBuildTime: unknown, latestBuildId: unknown, generatedAt: unknown}} input
 */
export function isCurrentRelease(input) {
  const currentBuildId = normalizeBuildId(input.currentBuildId);
  const latestBuildId = normalizeBuildId(input.latestBuildId);
  if (currentBuildId && latestBuildId && currentBuildId === latestBuildId) return true;

  const currentBuildTime = Date.parse(typeof input.currentBuildTime === "string" ? input.currentBuildTime : "");
  const generatedAt = Date.parse(typeof input.generatedAt === "string" ? input.generatedAt : "");
  return Number.isFinite(currentBuildTime) && Number.isFinite(generatedAt) && currentBuildTime >= generatedAt;
}
