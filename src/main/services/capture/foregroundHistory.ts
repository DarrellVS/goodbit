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

/** Two minutes: four times the longest replay buffer anyone sets. */
const WINDOW_MS = 120_000;
const SAMPLE_MS = 1000;

/** Long enough that a crash loop cannot spin, short enough to recover unnoticed. */
const RESTART_MS = 5000;

const samples: ForegroundSample[] = [];
let child: ChildProcess | null = null;
let stopping = false;
let restartTimer: NodeJS.Timeout | null = null;

function remember(sample: ForegroundSample): void {
  samples.push(sample);

  const cutoff = sample.at - WINDOW_MS;
  while (samples.length > 0 && samples[0]!.at < cutoff) samples.shift();
}

function readLines(chunk: string): void {
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.trim()) continue;

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

  child = spawn(helper, [String(SAMPLE_MS)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

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
