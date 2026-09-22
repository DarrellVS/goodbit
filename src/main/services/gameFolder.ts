import path from 'node:path';

/**
 * Characters Windows will not take in a folder name, plus the control range.
 * The two separators are the ones that matter: with either of them a game name
 * is a path, and `..\..\Windows` joined onto the videos root is somewhere else.
 */
const PROHIBITED = /[/\\:"<>*?|\x00-\x1f]/;

/** Device names Windows reserves in every folder, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Why a name cannot be a game folder, or null when it can.
 *
 * Refused rather than cleaned. `safeName` in `capture/gameNames.ts` cleans,
 * which is right for a name read off a store; this is a name somebody typed,
 * and moving their clip into a folder spelled differently from what they typed
 * would be a surprise found later.
 */
export function gameFolderProblem(name: string): string | null {
  if (!name) return 'A game needs a name';
  if (name === '.' || name === '..') return 'A game cannot be called that';
  if (PROHIBITED.test(name)) return 'A game name cannot contain / \\ : " < > * ? or |';
  // The watcher, the scan and the sweepers all skip dot folders on purpose, so a
  // clip moved into one would vanish from the library while still on disk.
  if (name.startsWith('.')) return 'A game name cannot start with a dot';
  // Windows drops these on its own, so the folder would not have the name asked for.
  const last = name[name.length - 1];
  if (last === '.' || last === ' ') return 'A game name cannot end with a dot or a space';
  if (RESERVED.test(name)) return 'Windows reserves that name';
  return null;
}

/**
 * The folder for a game, proved to sit directly inside the videos root.
 *
 * `gameFolderProblem` already rules out anything that could climb out, and
 * this checks the result anyway: one guard is a single point of failure, and
 * this is the line that decides where somebody's recording is moved to.
 */
export function gameFolderPath(videosRoot: string, name: string): string {
  const problem = gameFolderProblem(name);
  if (problem) throw new GameFolderError(problem);

  const root = path.resolve(videosRoot);
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep) || path.dirname(target) !== root) {
    throw new GameFolderError('A game folder has to sit inside the videos folder');
  }
  return target;
}

export class GameFolderError extends Error {}
