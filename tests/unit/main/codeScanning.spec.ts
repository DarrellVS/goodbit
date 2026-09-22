import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameFolderPath, gameFolderProblem } from '../../../src/main/services/gameFolder';
import { trimChar } from '../../../src/main/utils/trimChar';
import { planSearch } from '../../../src/main/services/clipSearch';
import { tagPatternProblem, MAX_TAG_PATTERN_LENGTH } from '../../../src/shared/constants/tagPatternRules';

/*
 * The fixes for the code scanning alerts, each held to what it claims: a game
 * name cannot move a recording out of the library, a trim is linear, and a tag
 * rule that could hang the library is refused while every ordinary one is not.
 */

describe('gameFolderProblem', () => {
  it.each(['Battlefield 6', 'Tom Clancy\'s Rainbow Six Siege', 'cs2', 'Headliners-Win64-Shipping', 'DOOM The Dark Ages'])(
    'accepts a real game folder: %s',
    (name) => expect(gameFolderProblem(name)).toBeNull(),
  );

  it.each([
    ['..', 'climbs out'],
    ['.', 'is the root itself'],
    ['..\\..\\Windows', 'is a Windows path'],
    ['../../etc', 'is a POSIX path'],
    ['C:evil', 'names a drive'],
    ['.goodbit-incoming', 'would be hidden from the scan'],
    ['Game.', 'loses its dot on Windows'],
    ['Game ', 'loses its space on Windows'],
    ['CON', 'is a device'],
    ['nul.txt', 'is a device with an extension'],
    ['a\u0000b', 'holds a control character'],
    ['', 'is empty'],
  ])('refuses %j, which %s', (name) => {
    expect(gameFolderProblem(name)).not.toBeNull();
  });
});

describe('gameFolderPath', () => {
  const root = path.resolve('/library');

  it('lands directly inside the videos root', () => {
    expect(gameFolderPath(root, 'Battlefield 6')).toBe(path.join(root, 'Battlefield 6'));
  });

  it('throws rather than returning a path outside it', () => {
    expect(() => gameFolderPath(root, '..')).toThrow();
    expect(() => gameFolderPath(root, '../outside')).toThrow();
  });
});

describe('trimChar', () => {
  it('trims both ends by default', () => {
    expect(trimChar("''don't''", "'")).toBe("don't");
  });

  it('trims only the end when asked', () => {
    expect(trimChar('..name...', '.', 'end')).toBe('..name');
  });

  it('empties a string that is all the character', () => {
    expect(trimChar("''''", "'")).toBe('');
  });

  it('is linear on the input that made the regex quadratic', () => {
    // A long run of dots that does not end the string: `/\.+$/` retries from
    // every position of it.
    const hostile = '.'.repeat(200_000) + 'x';
    const started = performance.now();
    expect(trimChar(hostile, '.', 'end')).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('leaves search terms as they were', () => {
    expect(planSearch("'clutch' don't").terms).toEqual(['clutch', "don't"]);
  });
});

describe('tagPatternProblem', () => {
  it.each(['clutch', 'ace|4k', '\\bheadshot\\b', '(double|triple) kill', 'kill{2,3}', '(?:a+)?b', '[+*]+', '\\(a+\\)+'])(
    'accepts an ordinary rule: %s',
    (source) => expect(tagPatternProblem(source)).toBeNull(),
  );

  it.each(['(a+)+', '(a*)*', '(\\w+\\s?)+$', '((ab)+c)+', '(a+){2,}', '(?:x+y)*'])(
    'refuses a rule that repeats a repetition: %s',
    (source) => expect(tagPatternProblem(source)).toMatch(/repeats something/),
  );

  it('refuses a rule that does not compile', () => {
    expect(tagPatternProblem('(')).toMatch(/not a valid expression/);
  });

  it('refuses an empty rule and a non-string', () => {
    expect(tagPatternProblem('  ')).not.toBeNull();
    expect(tagPatternProblem(42)).not.toBeNull();
  });

  it('refuses a rule longer than the cap', () => {
    expect(tagPatternProblem('a'.repeat(MAX_TAG_PATTERN_LENGTH))).toBeNull();
    expect(tagPatternProblem('a'.repeat(MAX_TAG_PATTERN_LENGTH + 1))).toMatch(/at most/);
  });
});
