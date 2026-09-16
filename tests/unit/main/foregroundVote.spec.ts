import { describe, expect, it } from 'vitest';
import {
  voteOver,
  type ForegroundSample,
} from '../../../src/main/services/capture/foregroundHistory.js';

/**
 * Which program a clip gets named after.
 *
 * The top-level folder name *is* the game name, so this vote decides what the
 * library looks like, and the rule is deliberately not a plain majority.
 * CLAUDE.md records the worked example it came from: somebody plays for twenty
 * minutes, tabs out to Discord to paste something, remembers the play they
 * just made and hits the replay key. Discord owns most of the last thirty
 * seconds and the clip is thirty seconds of Battlefield.
 *
 * Every one of those cases is arithmetic over a list, and none of it was
 * checkable before: the window is module state fed by a child process sampling
 * at 1 Hz, so the only way to exercise it was to play a game.
 */

const GAME = 'D:\\Steam\\steamapps\\common\\Battlefield 6\\bf6.exe';
const DISCORD = 'C:\\Users\\x\\AppData\\Local\\Discord\\app-1.0\\Discord.exe';
const BROWSER = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/** A 1 Hz run of samples, oldest first, the way the helper emits them. */
function run(...spans: Array<{ exe: string; seconds: number }>): ForegroundSample[] {
  const samples: ForegroundSample[] = [];
  let at = 1_700_000_000_000;

  for (const span of spans) {
    for (let i = 0; i < span.seconds; i++) {
      samples.push({ at, pid: 1234, exePath: span.exe });
      at += 1000;
    }
  }

  return samples;
}

/** The set of executables that resolve to a game at all. */
const isGame = (exePath: string): boolean => exePath === GAME;

describe('a game beats whatever is in front now', () => {
  it('names the clip after the game the person alt-tabbed away from', () => {
    // The worked example, exactly: 8 seconds of the game, then 22 of Discord.
    // A plain majority calls this Discord.
    const vote = voteOver(run({ exe: GAME, seconds: 8 }, { exe: DISCORD, seconds: 22 }), isGame);

    expect(vote?.exePath).toBe(GAME);
    expect(vote?.samples).toBe(8);
  });

  it('reports the whole window as the total, not just the part it counted', () => {
    // So a caller can see 8 of 30 and judge how thin the win was. Reporting 8
    // of 8 would make every filtered vote look unanimous.
    const vote = voteOver(run({ exe: GAME, seconds: 8 }, { exe: DISCORD, seconds: 22 }), isGame);

    expect(vote?.total).toBe(30);
  });

  it('holds even when the game was in front for a single second', () => {
    const vote = voteOver(run({ exe: DISCORD, seconds: 29 }, { exe: GAME, seconds: 1 }), isGame);

    expect(vote?.exePath).toBe(GAME);
    expect(vote?.samples).toBe(1);
  });
});

describe('a window with no game in it', () => {
  it('falls back to the most-seen program', () => {
    // Recording a browser is a thing people do on purpose, so this is not an
    // error case and must not come back null.
    const vote = voteOver(run({ exe: DISCORD, seconds: 5 }, { exe: BROWSER, seconds: 25 }), isGame);

    expect(vote?.exePath).toBe(BROWSER);
    expect(vote?.samples).toBe(25);
  });

  it('counts every sample once it has given up on finding a game', () => {
    const vote = voteOver(run({ exe: DISCORD, seconds: 12 }), isGame);

    expect(vote?.samples).toBe(12);
    expect(vote?.total).toBe(12);
  });

  it('behaves the same with no filter at all', () => {
    const window = run({ exe: DISCORD, seconds: 5 }, { exe: BROWSER, seconds: 25 });

    expect(voteOver(window)).toEqual(voteOver(window, isGame));
  });
});

describe('a tie', () => {
  it('breaks toward the end of the window', () => {
    // The key is pressed at the end, so the thing in front when it was pressed
    // is the better guess out of two equals.
    const vote = voteOver(run({ exe: BROWSER, seconds: 10 }, { exe: DISCORD, seconds: 10 }));

    expect(vote?.exePath).toBe(DISCORD);
  });

  it('breaks the same way whichever order the samples arrived in', () => {
    const vote = voteOver(run({ exe: DISCORD, seconds: 10 }, { exe: BROWSER, seconds: 10 }));

    expect(vote?.exePath).toBe(BROWSER);
  });

  it('is decided by the last sighting, not by a contiguous run', () => {
    // Alt-tabbing back and forth. Both have 10 samples; Discord's last one is
    // later, so Discord wins.
    const vote = voteOver(
      run(
        { exe: BROWSER, seconds: 5 },
        { exe: DISCORD, seconds: 5 },
        { exe: BROWSER, seconds: 5 },
        { exe: DISCORD, seconds: 5 },
      ),
    );

    expect(vote?.exePath).toBe(DISCORD);
    expect(vote?.samples).toBe(10);
  });
});

describe('the same program, spelled differently', () => {
  it('counts one program once, however Windows cased the path', () => {
    // The helper reports whatever the OS handed back, and Windows is not
    // consistent about drive letters or Program Files casing.
    const vote = voteOver([
      { at: 1, pid: 1, exePath: 'C:\\Games\\Thing\\thing.exe' },
      { at: 2, pid: 1, exePath: 'c:\\games\\thing\\THING.exe' },
      { at: 3, pid: 1, exePath: 'C:\\Games\\Thing\\thing.exe' },
      { at: 4, pid: 1, exePath: BROWSER },
    ]);

    expect(vote?.samples).toBe(3);
  });

  it('gives back a path exactly as it was sampled, not a lowercased one', () => {
    // The result is matched against install folders and written into a folder
    // name, so a flattened path would fail the match and look wrong on disk.
    const spellings = ['c:\\games\\thing\\THING.exe', 'C:\\Games\\Thing\\thing.exe'];
    const vote = voteOver([
      { at: 1, pid: 1, exePath: spellings[0]! },
      { at: 2, pid: 1, exePath: spellings[1]! },
    ]);

    expect(spellings).toContain(vote?.exePath);
  });
});

describe('nothing to go on', () => {
  it('is null for an empty window, never a crash and never a guess', () => {
    // Becomes `Unsorted` upstream, which is a real answer. A thrown error here
    // would lose the clip's name entirely.
    expect(voteOver([])).toBeNull();
  });

  it('is null when every sample has no executable path', () => {
    // A protected process denies the query, so the helper emits the timestamp
    // with nothing after it.
    expect(
      voteOver([
        { at: 1, pid: 0, exePath: '' },
        { at: 2, pid: 0, exePath: '' },
      ]),
    ).toBeNull();
  });

  it('ignores the blank samples and votes on the rest', () => {
    const vote = voteOver([
      { at: 1, pid: 0, exePath: '' },
      { at: 2, pid: 1, exePath: GAME },
      { at: 3, pid: 0, exePath: '' },
    ]);

    expect(vote?.exePath).toBe(GAME);
    expect(vote?.total).toBe(1);
  });
});
