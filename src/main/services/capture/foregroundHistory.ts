/**
 * What was in front, and when.
 *
 * A clip arrives seconds after the moment it records. The replay buffer holds
 * the last thirty seconds, OBS writes the file when the key is pressed, and
 * the watcher only sees it once the write has settled. By then the user may
 * well have alt-tabbed. So "what is in the foreground now" is the wrong
 * question, and the right one is "what was in the foreground while that clip
 * was being recorded", which needs a memory.
 *
 * Two minutes of it, sampled once a second. Measured at 0.11% of one core and
 * 13 MB, which is the same order as doing nothing.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { ensureHelper } from './foregroundHelper.js';

export interface ForegroundSample {
  at: number;
  pid: number;
  exePath: string;
}

/**
 * What the helper last said about the process it was asked to watch.
 *
 * `unknown` is its own answer rather than a missing one: it means the handle
 * could never be opened, so nothing can be concluded. A caller that treated it
 * as `exited` would end a session somebody is still playing.
 */
export type TrackedState = 'alive' | 'exited' | 'unknown';

/** Two minutes: four times the longest replay buffer anyone sets. */
const WINDOW_MS = 120_000;
const SAMPLE_MS = 1000;

/** Long enough that a crash loop cannot spin, short enough to recover unnoticed. */
const RESTART_MS = 5000;

const samples: ForegroundSample[] = [];
let child: ChildProcess | null = null;
let stopping = false;
let restartTimer: NodeJS.Timeout | null = null;

/** The pid the helper is watching, and what it last said about it. */
let trackedPid = 0;
let trackedState: TrackedState | null = null;

/** Everyone who wants to know about a sample as it lands, rather than later. */
const listeners = new Set<(sample: ForegroundSample) => void>();

/** Whether the window in front covers its whole monitor, as of the last sample. */
let fullscreen = false;
const fullscreenListeners = new Set<(fullscreen: boolean) => void>();

/**
 * Hear when the window in front starts or stops owning its monitor.
 *
 * Only on a change, so a listener can act on every call. At the helper's one
 * sample a second, which is soon enough for a line to get out of the way.
 */
export function onFullscreenChange(listener: (fullscreen: boolean) => void): () => void {
  fullscreenListeners.add(listener);
  return () => fullscreenListeners.delete(listener);
}

export function foregroundIsFullscreen(): boolean {
  return fullscreen;
}

function remember(sample: ForegroundSample): void {
  samples.push(sample);

  const cutoff = sample.at - WINDOW_MS;
  while (samples.length > 0 && samples[0]!.at < cutoff) samples.shift();

  for (const listener of listeners) {
    try {
      listener(sample);
    } catch (error) {
      // A listener that throws must not take the sampler with it: this is the
      // only thing feeding clip attribution.
      console.warn('[capture] foreground listener failed:', (error as Error).message);
    }
  }
}

/**
 * Hear about every sample as it lands.
 *
 * The session watcher needs the beat rather than the window: it is deciding
 * whether a game is still running, once a second, and polling the ring for the
 * newest entry would mean either missing samples or reading the same one
 * twice.
 */
export function onForegroundSample(listener: (sample: ForegroundSample) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readLines(chunk: string): void {
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.trim()) continue;

    // The liveness line, which only appears while a pid is being tracked.
    // Checked before the sample parse rather than after, because `Number('L')`
    // is NaN and it would otherwise be discarded as a malformed sample.
    if (line.startsWith('L\t')) {
      const [, pid, state] = line.split('\t');
      /*
       * Trimmed, and that is not decoration.
       *
       * The reader slices its buffer at the last newline, so the final
       * line of a chunk keeps the carriage return that preceded it. The
       * sample branch below has always trimmed its path and so never
       * noticed. This one compared a carriage-returned 'alive' against
       * 'alive', fell through to 'unknown', and reported every tracked
       * game as unreadable while the helper was answering correctly.
       */
      const answer = (state ?? '').trim();
      if (Number(pid) === trackedPid) {
        trackedState =
          answer === 'alive' || answer === 'exited' || answer === 'unknown'
            ? answer
            : 'unknown';
      }
      continue;
    }

    // Whether the window in front owns its monitor. See the helper.
    if (line.startsWith('F\t')) {
      const now = line.slice(2).trim() === '1';
      if (now !== fullscreen) {
        fullscreen = now;
        for (const listener of fullscreenListeners) {
          try {
            listener(now);
          } catch (error) {
            console.warn('[capture] fullscreen listener failed:', (error as Error).message);
          }
        }
      }
      continue;
    }

    const [at, pid, ...rest] = line.split('\t');
    const exePath = rest.join('\t').trim();
    const when = Number(at);
    if (!Number.isFinite(when)) continue;

    remember({ at: when, pid: Number(pid) || 0, exePath });
  }
}

/**
 * Start sampling, and keep sampling.
 *
 * Never throws. A machine without the helper simply has no history, and every
 * caller already has to handle an empty window.
 */
export async function startForegroundHistory(): Promise<void> {
  if (child || stopping) return;

  const helper = await ensureHelper();
  if (!helper) {
    console.warn('[capture] no foreground helper, clips will not be named automatically');
    return;
  }

  // stdin is a pipe now: it is how a pid to watch is handed over. See
  // `trackProcess`.
  child = spawn(helper, [String(SAMPLE_MS)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

  // A helper that restarted has forgotten what it was watching, and the caller
  // is not told, so ask again for whatever was being tracked.
  if (trackedPid !== 0) child.stdin?.write(`T ${trackedPid}\n`);
  for (const handle of quietWindows) child.stdin?.write(`N ${handle}\n`);

  let pending = '';
  child.stdout?.setEncoding('utf-8');
  child.stdout?.on('data', (chunk: string) => {
    // A sample can be split across reads, so hold the tail until it ends.
    pending += chunk;
    const lastBreak = pending.lastIndexOf('\n');
    if (lastBreak === -1) return;

    readLines(pending.slice(0, lastBreak));
    pending = pending.slice(lastBreak + 1);
  });

  child.on('error', (error) => {
    console.warn('[capture] foreground helper failed:', error.message);
  });

  child.on('exit', (code) => {
    child = null;
    if (stopping) return;

    console.warn(`[capture] foreground helper exited (${code}), restarting`);
    restartTimer = setTimeout(() => void startForegroundHistory(), RESTART_MS);
  });

  console.log('[capture] watching which program is in front');
}

export function stopForegroundHistory(): void {
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  child?.kill();
  child = null;
}

/**
 * Watch one process, and stop watching whatever was being watched before.
 *
 * The pid goes to the helper rather than to `process.kill(pid, 0)` here,
 * because the helper holds an open handle and that is what stops the pid being
 * reused under the question. Zero clears it.
 *
 * Fire and forget: if the helper is not running there is nothing to watch with,
 * and `startForegroundHistory` re-sends this when it comes back.
 */
export function trackProcess(pid: number): void {
  trackedPid = pid;
  // Whatever the last answer was, it was about a different process.
  trackedState = null;
  child?.stdin?.write(pid > 0 ? `T ${pid}\n` : 'U\n');
}

/**
 * What the helper last said about the tracked process.
 *
 * Null until it has said anything, which is the first second after a pid is
 * handed over, and after a helper restart.
 */
/** Windows whose show animation has been turned off, remembered for a restarted helper. */
const quietWindows = new Set<string>();

/**
 * Turn off Windows' own show and hide animation for one of our windows.
 *
 * The helper does it because it is already a compiled program holding the
 * Win32 imports, and Electron has no switch for it. A helper that restarts is
 * handed the list again, since the attribute has to be set by somebody and a
 * restart forgets nothing about the window itself but everything about this.
 */
export function disableWindowTransitions(hwnd: bigint): void {
  const handle = hwnd.toString();
  quietWindows.add(handle);
  child?.stdin?.write(`N ${handle}\n`);
}

export function trackedProcessState(): { pid: number; state: TrackedState } | null {
  if (trackedPid === 0 || trackedState === null) return null;
  return { pid: trackedPid, state: trackedState };
}

/** What is in front right now, or null if nothing has been sampled yet. */
export function currentForeground(): ForegroundSample | null {
  return samples.length > 0 ? samples[samples.length - 1]! : null;
}

/** Everything sampled in a window, oldest first. Exposed for the bench. */
export function samplesBetween(from: number, to: number): ForegroundSample[] {
  return samples.filter((sample) => sample.at >= from && sample.at <= to);
}

export interface ForegroundVote {
  exePath: string;
  /** How many of the window's samples were this program. */
  samples: number;
  /** How many samples the window held at all, so a caller can judge the margin. */
  total: number;
}

/**
 * Who owned a window of time.
 *
 * A plain majority is the wrong rule and it took a worked example to see why.
 * Somebody plays for twenty minutes, tabs out to Discord to paste something,
 * remembers the play they just made and hits the key. Discord owns most of the
 * last thirty seconds, and the clip is thirty seconds of Battlefield.
 *
 * So the caller filters first: `candidates` is the set of executables that
 * resolve to a game at all, and only those are counted. If the window holds no
 * game, every sample counts and the caller falls back to naming it after
 * whatever was there. An empty window is null, which becomes `Unsorted`, never
 * a crash and never a silent drop.
 *
 * Ties break toward the end of the window, because the key is pressed at the
 * end and the thing in front when it was pressed is the better guess.
 */
export function dominantBetween(
  from: number,
  to: number,
  candidates?: (exePath: string) => boolean,
): ForegroundVote | null {
  return voteOver(samplesBetween(from, to), candidates);
}

/**
 * The vote itself, over samples handed in rather than read from the history.
 *
 * Split out so the rule can be checked without a running helper: the history
 * is two minutes of module state fed by a child process, and the part worth
 * testing is this arithmetic. `dominantBetween` is the same function with the
 * window read from that state.
 */
export function voteOver(
  taken: ForegroundSample[],
  candidates?: (exePath: string) => boolean,
): ForegroundVote | null {
  const window = taken.filter((sample) => sample.exePath);
  if (window.length === 0) return null;

  const eligible = candidates ? window.filter((sample) => candidates(sample.exePath)) : window;
  const counted = eligible.length > 0 ? eligible : window;

  const counts = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  for (const sample of counted) {
    const key = sample.exePath.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    lastSeen.set(key, sample.at);
  }

  let bestKey = '';
  let best = 0;
  for (const [key, count] of counts) {
    if (count > best || (count === best && (lastSeen.get(key) ?? 0) > (lastSeen.get(bestKey) ?? 0))) {
      bestKey = key;
      best = count;
    }
  }

  // The original casing, which is what a path match wants.
  const exePath = counted.find((sample) => sample.exePath.toLowerCase() === bestKey)?.exePath ?? '';
  return exePath ? { exePath, samples: best, total: window.length } : null;
}
