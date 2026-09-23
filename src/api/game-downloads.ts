import type {
  ResponseDownloadLatestDto,
  ResponseDownloadUrlDto,
} from "./generated/shop/Api";
import { shopApi } from "./shop";
import type { GameDownloadPlatform } from "@/lib/platform";
import { detectGameDownloadPlatform } from "@/lib/platform";

/** Latest public version strings per platform. */
export async function fetchLatestVersions(): Promise<ResponseDownloadLatestDto> {
  const res =
    await shopApi.gameDownloads.gameDownloadsControllerGetLatestGameVersions();
  return res.data;
}

/** Presigned download URL + version for one platform (requires auth + licence). */
export async function fetchDownloadForPlatform(
  platform: GameDownloadPlatform = detectGameDownloadPlatform(),
): Promise<ResponseDownloadUrlDto> {
  const { gameDownloads } = shopApi;

  switch (platform) {
    case "windows":
      return (
        await gameDownloads.gameDownloadsControllerGetWindowsDownloadUrl()
      ).data;
    case "macos":
      return (await gameDownloads.gameDownloadsControllerGetMacOsDownloadUrl())
        .data;
    case "linux":
      return (await gameDownloads.gameDownloadsControllerGetLinuxDownloadUrl())
        .data;
  }
}
