import { describe, expect, it } from "vitest";
import { detectGameDownloadPlatform } from "./platform";

describe("detectGameDownloadPlatform", () => {
  it("detects Windows from userAgent", () => {
    expect(
      detectGameDownloadPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Win32",
        undefined,
      ),
    ).toBe("windows");
  });

  it("detects macOS from platform hint", () => {
    expect(detectGameDownloadPlatform("Mozilla/5.0", "MacIntel", undefined)).toBe(
      "macos",
    );
  });

  it("falls back to linux for other agents", () => {
    expect(
      detectGameDownloadPlatform(
        "Mozilla/5.0 (X11; Linux x86_64)",
        "Linux x86_64",
        undefined,
      ),
    ).toBe("linux");
  });

  it("prefers userAgentData.platform when present", () => {
    expect(
      detectGameDownloadPlatform("Mozilla/5.0", "Win32", {
        userAgent: "Mozilla/5.0",
        platform: "Win32",
        userAgentData: { platform: "macOS" },
      }),
    ).toBe("macos");
  });
});
