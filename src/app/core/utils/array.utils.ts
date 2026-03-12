/**
 * Generic array utility functions.
 */

/** Fisher-Yates shuffle — returns a new shuffled array without mutating the original. */
export function shuffleArray<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Pick `count` random items from `arr` (shuffled, no duplicates). */
export function pickRandomItems<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return arr.slice();
  return shuffleArray(arr).slice(0, count);
}
