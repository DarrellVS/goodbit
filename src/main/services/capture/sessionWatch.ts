import os from 'node:os';
import { Between } from 'typeorm';
import { AppDataSource, VIDEOS_ROOT } from '../../data-source.js';
import { Clip } from '../../entity/Clip.js';
import { EnsureClipSuggestionsAction } from '../../actions/EnsureClipSuggestionsAction.js';
import { loadSettings } from '../../settings.js';
import { announce } from '../../startup.js';
import { completeJob, createJob, failJob, jobSignal, setJobProgress } from '../jobs.js';
import { encodersIfKnown } from '../encoders.js';
import {
  currentForeground,
  onForegroundSample,
  trackProcess,
  trackedProcessState,
} from './foregroundHistory.js';
import { drainIncoming } from './incoming.js';
import { gameForExecutable, isKnownGame, libraryFolders, UNSORTED } from './gameNames.js';
import { IDLE, stepSession, type EndedSession, type SessionState } from './sessionEnd.js';

/**
 * Reading the session's clips the moment the game closes.
 *
 * Suggestions are worked out when somebody opens the Trim page, which is the
 * right rule for a half that decodes video: doing it while OBS is filling a
 * replay buffer is the thing to avoid. Its cost is that the first open of
 * every clip pays for the read, one clip at a time, while somebody sits there
 * waiting to cut.
 *
 * Closing the game is the one moment when the machine is unambiguously free
 * and the answer is wanted: the GPU is idle, nothing is recording, and the
 * clips from that session are exactly the ones about to be looked at.
 *
 * The hard part is knowing that the game *closed*, which the foreground
 * samples cannot say. `sessionEnd.ts` holds that decision and takes liveness
 * as an argument; `foregroundHelper.ts` answers it from a held handle. This
 * file is the wiring and the sweep.
 *
 * **Every moment it is sure of becomes a GoodBit.** The sweep warms the
 * measurement cache, which is what makes the Trim page instant, records how
 * many moments were found so a library card can say there is something to
 * look at, and writes each one down as a short GoodBit around the instant
 * (`services/detectedGoodBits.ts`). It used to write nothing and leave keeping
 * them to a press, which let a card say "1 GoodBit found" over a clip whose
 * list said nothing was marked.
 */

/** How long to wait after a process goes before believing it. */
const SETTLE_MS = 20_000;

/**
 * How far either side of the session to look for its clips.
 *
 * A replay covers the seconds *before* the key was pressed, and the file is
 * filed a moment after, so the edges of a session are soft in both directions.
 * A minute is comfortably more than either and comfortably less than the gap
 * between two sessions.
 */
const EDGE_SLACK_MS = 60_000;

/**
 * The longest the "looking" card may stay up.
 *
 * The sweep replaces it when it finishes, so this only matters if the job dies
 * without ever reporting. Ten minutes is far longer than any real session's
 * worth of clips and far shorter than leaving a card up all evening.
 */
const CARD_MAX_MS = 10 * 60_000;

/**
 * How many clips to read at once.
 *
 * Two on a machine with a hardware decoder and enough cores, one otherwise.
 * The screen-reading half is GPU-bound and the listening half is a hundred
 * milliseconds, so on a machine that has NVDEC to lean on a second clip
 * overlaps the first nicely; without one, decoding is software and two at once
 * is two things being slow at each other on a laptop that has just finished
 * running a game.
 *
 * `mediaQueue` caps ffmpeg processes globally at four regardless, so this is a
 * ceiling on *this* work rather than a promise about the machine.
 */
function sweepConcurrency(): number {
  const encoders = encodersIfKnown();
  const hardwareDecode = !!encoders?.hwaccel;
  return hardwareDecode && os.cpus().length >= 8 ? 2 : 1;
}

/**
 * Executables already known to be games, and the ones already asked about.
 *
 * `isKnownGame` is async and the decision is not, the same shape
 * `IngestReplayAction` uses and for the same reason. The answer for one
 * executable never changes within a session, and somebody plays a handful.
 */
const knownGames = new Set<string>();
const asked = new Set<string>();

function isGame(exePath: string): boolean {
  return knownGames.has(exePath.toLowerCase());
}

function askAbout(exePath: string): void {
  const key = exePath.toLowerCase();
  if (!exePath || asked.has(key)) return;
  asked.add(key);

  void isKnownGame(exePath)
    .then((known) => {
      if (known) knownGames.add(key);
    })
    .catch(() => {
      // A machine that cannot answer has no games as far as this is concerned,
      // which means no sweeps rather than sweeps at the wrong moment.
    });
}

let state: SessionState = IDLE;
let detach: (() => void) | null = null;
let sweeping = false;
let paused = false;
let lastSampleAt = 0;

/**
 * Stop and start sweeping, around something that makes the library unreadable.
 *
 * The videos root moving is the case: `suspendLibrary` stops the watchers
 * while files are moved under them, and a sweep in that window would be
 * reading rows whose files are somewhere else. The session machine keeps
 * running, so a game closed during a move is simply not swept.
 */
export function setSweepsPaused(value: boolean): void {
  paused = value;
}

/**
 * Start watching for a session ending. Registered once, however many times the
 * services restart, the same way the filed listener is.
 */
export function watchGameSessions(): void {
  if (detach) return;

  detach = onForegroundSample((sample) => {
    askAbout(sample.exePath);

    /*
     * A hole in the samples is not a session ending.
     *
     * The machine sleeping, or the helper dying and being restarted, leaves a
     * gap: the next sample arrives with the game gone, which looks exactly
     * like somebody closing it and would fire a sweep on the first second
     * after a laptop wakes up. Nothing can be concluded across a gap, so the
     * machine starts again from whatever is in front now.
     */
    const gap = lastSampleAt === 0 ? 0 : sample.at - lastSampleAt;
    lastSampleAt = sample.at;
    if (gap > SETTLE_MS) {
      state = IDLE;
      trackProcess(0);
      return;
    }

    const tracked = trackedProcessState();
    const step = stepSession(state, {
      sample,
      // Only the answer about the pid being watched, never a stale one about
      // the process before it.
      tracked: tracked && tracked.pid === pidOf(state) ? tracked.state : null,
      now: sample.at,
      isGame,
      settleMs: SETTLE_MS,
    });

    state = step.state;
    if (step.track !== undefined) trackProcess(step.track);
    if (step.ended) void sweepSession(step.ended);
  });
}

export function stopWatchingGameSessions(): void {
  detach?.();
  detach = null;
  state = IDLE;
  trackProcess(0);
}

function pidOf(current: SessionState): number {
  return current.phase === 'idle' ? 0 : current.pid;
}

/**
 * Read everything that session recorded, now that nothing else wants the GPU.
 *
 * Every early return here is a reason not to take somebody's machine: the
 * feature is off, another game is already running, or the session produced
 * nothing worth reading.
 */
async function sweepSession(session: EndedSession): Promise<void> {
  if (loadSettings().analyzeOnGameClose === false) return;
  if (paused || sweeping) return;

  /*
   * Somebody who closes one game and starts another should not have their GPU
   * taken. The sampler already knows what is in front, so this is a question
   * rather than new machinery.
   */
  const front = currentForeground();
  if (front && front.exePath && isGame(front.exePath)) {
    console.log('[sweep] stood down: another game is in front');
    return;
  }

  sweeping = true;
  try {
    /*
     * Staging first.
     *
     * A clip still in `.goodbit-incoming/` when the game closes is the last
     * play of the night, which is the one most likely to be worth cutting.
     * Firing before it has been filed reads every clip except that one.
     */
    await drainIncoming();

    const game = await gameForExecutable(
      session.exePath,
      libraryFolders(VIDEOS_ROOT),
      loadSettings().gameOverrides ?? {},
    );
    if (game.name === UNSORTED) return;

    const clips = await AppDataSource.getRepository(Clip).find({
      where: {
        game: game.name,
        recordedAt: Between(
          new Date(session.from - EDGE_SLACK_MS),
          new Date(session.to + EDGE_SLACK_MS),
        ),
      },
      order: { recordedAt: 'ASC' },
    });

    if (clips.length === 0) {
      console.log(`[sweep] ${game.name} closed with nothing recorded`);
      return;
    }

    await readClips(clips, game.name);
  } catch (error) {
    console.error('[sweep]', error instanceof Error ? error.message : error);
  } finally {
    sweeping = false;
  }
}

/** The work itself, as a job, so it has progress, an ETA and a way to stop. */
async function readClips(clips: Clip[], game: string): Promise<void> {
  const { dismissPeek, showSweepFinished, showSweepStarted } = await import(
    '../notch/index.js'
  );

  const job = createJob('analyze', `Looking for GoodBits in ${clips.length} ${game} clips`);
  const signal = jobSignal(job.id);
  const started = Date.now();

  await showSweepStarted(clips.length, game, CARD_MAX_MS);

  let done = 0;
  let found = 0;
  /** The clips that held something, for the notch's "open them in the editor". */
  const withMoments: number[] = [];
  const repo = AppDataSource.getRepository(Clip);
  const queue = [...clips];

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return;
      const clip = queue.shift();
      if (!clip) return;

      try {
        const result = await new EnsureClipSuggestionsAction().execute({
          clipId: clip.id,
          refresh: false,
        });

        /*
         * What the card counts, and what a library tile reads.
         *
         * The anchors when the screen found any, because those are the moments
         * somebody can jump to. A verdict that is confident on the sound alone
         * has no list, and it is still one thing worth looking at.
         */
        const moments = result.anchors.length || (result.confident ? 1 : 0);
        found += moments;
        if (moments > 0) withMoments.push(clip.id);
        await repo.update({ id: clip.id }, { suggestedCount: moments });
        // And each of them written down as a GoodBit, so the count on the
        // card is a count of things that are there when it is opened.
        const { markDetected } = await import('../detectedGoodBits.js');
        await markDetected(clip.id, result);

        // The window is looking at rows that no longer match the database.
        // Said per clip rather than once at the end, so badges appear as the
        // sweep works rather than all at once when it finishes.
        announce({ type: 'clip-analyzed', clipId: clip.id, suggestedCount: moments });
      } catch (error) {
        // One unreadable clip is not a failed sweep. A file that has been
        // moved or a decoder that refused it should cost that clip and
        // nothing else.
        console.warn(`[sweep] ${clip.filename}:`, (error as Error).message);
      }

      done += 1;
      setJobProgress(job.id, Math.round((done / clips.length) * 100), `${done}/${clips.length}`);
    }
  };

  await Promise.all(Array.from({ length: sweepConcurrency() }, worker));

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (signal?.aborted) {
    failJob(job.id, 'cancelled');
    dismissPeek();
    console.log(`[sweep] stopped after ${done}/${clips.length} clips`);
    return;
  }

  completeJob(job.id);
  console.log(`[sweep] ${game}: ${found} in ${clips.length} clips, ${seconds}s`);

  /*
   * Only say so when there is something to say.
   *
   * A card that arrives after somebody has stopped playing, to tell them
   * nothing was found, is an interruption with no payload. The promise half
   * was worth drawing because it says why the machine is busy; this half is
   * only worth drawing when it resolves into something.
   */
  if (found > 0) await showSweepFinished(found, clips.length, withMoments);
  else dismissPeek();
}
