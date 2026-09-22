/**
 * Take a run of one character off either end of a string.
 *
 * A loop rather than `/^x+|x+$/`: an end-anchored `x+$` is retried from every
 * position of a long run that turns out not to end the string, which is
 * quadratic in the run's length, and both call sites trim text somebody typed.
 */
export function trimChar(value: string, char: string, ends: 'both' | 'end' = 'both'): string {
  let start = 0;
  let end = value.length;
  if (ends === 'both') {
    while (start < end && value[start] === char) start++;
  }
  while (end > start && value[end - 1] === char) end--;
  return value.slice(start, end);
}
