/** Compare Major.Minor.Patch. Negative if a < b, positive if a > b. */
export function compareSemver(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = left[i]! - right[i]!;
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** Parse Major.Minor.Patch; strip a leading v and ignore junk after the number. */
export function versionParts(version: string): [number, number, number] {
  const cleaned = version.trim().replace(/^v/i, "");
  const segments = cleaned.split(".");
  const part = (index: number): number => {
    const raw = segments[index] ?? "0";
    const match = raw.match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : 0;
  };
  return [part(0), part(1), part(2)];
}
