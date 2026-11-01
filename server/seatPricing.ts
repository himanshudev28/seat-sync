/**
 * Cinema-style seat pricing, the single rule used by the seed and by admin seat generation.
 *
 * Rows are split into thirds by distance from the screen, the same way the seat map splits
 * them into sections (Math.ceil(rows / 3)):
 *   tier 0 = front (nearest the screen)  → base price (cheapest)
 *   tier 1 = middle / back               → base + step
 *   tier 2 = last third ("balcony")      → base + 2 × step (dearest)
 * Free events stay free.
 */

/** Price step between tiers: 25% of the base, rounded to ₹10, at least ₹10. */
export function tierStep(base: number): number {
  if (!(base > 0)) return 0;
  return Math.max(10, Math.round((base * 0.25) / 10) * 10);
}

/** Tier (0 front, 1 middle, 2 back/balcony) of the row at `rowIndex` among `rowCount` rows. */
export function tierOfRow(rowIndex: number, rowCount: number): 0 | 1 | 2 {
  const size = Math.max(1, Math.ceil(rowCount / 3));
  return Math.min(2, Math.floor(rowIndex / size)) as 0 | 1 | 2;
}

/** Price of a seat in `tier` for an event whose base (cheapest) price is `base`. */
export function tierPrice(base: number, tier: 0 | 1 | 2): number {
  if (!(base > 0)) return 0;
  return base + tier * tierStep(base);
}
