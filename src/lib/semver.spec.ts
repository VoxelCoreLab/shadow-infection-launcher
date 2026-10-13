import { describe, expect, it } from "vitest";
import { compareSemver, versionParts } from "./semver";

describe("compareSemver", () => {
  it("orders patch builds like 0.0.85 below 0.0.94", () => {
    expect(compareSemver("0.0.85", "0.0.94")).toBeLessThan(0);
    expect(compareSemver("0.0.94", "0.0.85")).toBeGreaterThan(0);
  });

  it("orders 1.10.0 above 1.2.3", () => {
    expect(compareSemver("1.10.0", "1.2.3")).toBeGreaterThan(0);
  });

  it("parses a leading v", () => {
    expect(versionParts("v0.0.94")).toEqual([0, 0, 94]);
  });
});
