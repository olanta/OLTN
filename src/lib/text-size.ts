/* Predefined text sizes offered in Settings > Accessibility. */

export const TEXT_SIZES = [12, 14, 16, 18, 20, 22, 24] as const;
export const DEFAULT_TEXT_SIZE = 16;

/** Snaps an arbitrary stored value to the closest preset. */
export function normalizeTextSize(value: unknown): number {
  const size = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_TEXT_SIZE;
  return TEXT_SIZES.reduce(
    (best, candidate) => (Math.abs(candidate - size) < Math.abs(best - size) ? candidate : best),
    DEFAULT_TEXT_SIZE,
  );
}
