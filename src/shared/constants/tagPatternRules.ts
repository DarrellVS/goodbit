/**
 * What a tag rule is allowed to be.
 *
 * A tag rule is a regular expression the user writes, so compiling user input
 * is the feature rather than a mistake, and escaping it would turn every rule
 * into a literal. What can go wrong is an expression that backtracks without
 * end: `(a+)+` against a long filename freezes the renderer on every clip it is
 * matched to, for as long as it stays saved. So a rule is refused when it is
 * long, and when it repeats something that already repeats, which is the shape
 * behind nearly every catastrophic expression.
 *
 * Shared because the route, the DTO and the editor all ask the same question,
 * and two answers to it is how a rule the editor accepted gets a 400.
 */

/** Far longer than any rule anybody has written, and short enough to reason about. */
export const MAX_TAG_PATTERN_LENGTH = 200;

/** Why an expression cannot be a tag rule, or null when it can. */
export function tagPatternProblem(source: unknown): string | null {
  if (typeof source !== 'string' || !source.trim()) return 'An expression cannot be empty';
  if (source.length > MAX_TAG_PATTERN_LENGTH) {
    return `An expression can be at most ${MAX_TAG_PATTERN_LENGTH} characters`;
  }
  try {
    new RegExp(source, 'i');
  } catch {
    return `"${source}" is not a valid expression`;
  }
  if (repeatsARepetition(source)) {
    return `"${source}" repeats something that already repeats, which can freeze the library`;
  }
  return null;
}

/**
 * Does a quantified group contain a quantifier of its own?
 *
 * A scan rather than a regular expression, since a pattern that recognises
 * nested quantifiers is itself the kind of pattern that backtracks. `?` is not
 * counted: `(a+)?` matches the group once or not at all, which cannot explode.
 */
function repeatsARepetition(source: string): boolean {
  const groups: boolean[] = [];
  let closedGroupRepeats = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ch === '\\') {
      i++;
      closedGroupRepeats = false;
      continue;
    }
    if (ch === '[') {
      // A class is one character, whatever is inside it.
      i++;
      while (i < source.length && source[i] !== ']') {
        if (source[i] === '\\') i++;
        i++;
      }
      closedGroupRepeats = false;
      continue;
    }
    if (ch === '(') {
      groups.push(false);
      closedGroupRepeats = false;
      continue;
    }
    if (ch === ')') {
      const repeats = groups.pop() ?? false;
      if (repeats && groups.length) groups[groups.length - 1] = true;
      closedGroupRepeats = repeats;
      continue;
    }

    const quantifier = ch === '*' || ch === '+' || (ch === '{' && /\d/.test(source[i + 1] ?? ''));
    if (quantifier) {
      if (closedGroupRepeats) return true;
      if (groups.length) groups[groups.length - 1] = true;
    }
    closedGroupRepeats = false;
  }
  return false;
}
