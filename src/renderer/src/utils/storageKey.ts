/**
 * Carrying a stored preference over a rename.
 *
 * The app was called Filmpje and its localStorage keys said so. Renaming them
 * outright would silently reset everyone's view settings and theme on the
 * version that did it, so the old key is copied across once and then left
 * alone. There is no second app reading it.
 */
export function carryOverKey(legacyKey: string, key: string): void {
  try {
    if (localStorage.getItem(key) !== null) return;

    const stored = localStorage.getItem(legacyKey);
    if (stored === null) return;

    localStorage.setItem(key, stored);
    localStorage.removeItem(legacyKey);
  } catch {
    // Storage can be unavailable; a default is a fine outcome.
  }
}
