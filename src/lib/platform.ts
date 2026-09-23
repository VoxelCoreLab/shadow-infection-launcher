/** Platforms exposed by the Shop API game-download endpoints. */
export type GameDownloadPlatform = "windows" | "macos" | "linux";

type NavigatorLike = {
  userAgent?: string;
  platform?: string;
  userAgentData?: { platform?: string };
};

/**
 * Maps the current runtime OS to a Shop API download platform.
 * Prefer `navigator.userAgentData` when available, then fall back to UA / platform.
 */
export function detectGameDownloadPlatform(
  userAgent?: string,
  platformHint?: string,
  nav: NavigatorLike | undefined = typeof navigator !== "undefined"
    ? navigator
    : undefined,
): GameDownloadPlatform {
  const uaData = nav?.userAgentData?.platform?.toLowerCase();
  if (uaData) {
    if (uaData.includes("win")) return "windows";
    if (uaData.includes("mac")) return "macos";
    if (uaData.includes("linux")) return "linux";
  }

  const ua = userAgent ?? nav?.userAgent ?? "";
  const hint = platformHint ?? nav?.platform ?? "";
  const haystack = `${hint} ${ua}`.toLowerCase();

  if (haystack.includes("win")) {
    return "windows";
  }
  if (
    haystack.includes("mac") ||
    haystack.includes("darwin") ||
    haystack.includes("iphone") ||
    haystack.includes("ipad")
  ) {
    return "macos";
  }
  return "linux";
}
