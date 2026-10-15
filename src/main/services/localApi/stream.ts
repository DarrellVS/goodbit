/**
 * OWNER: events.
 *
 * Subscribers and NDJSON: the snapshot on subscribe, whole-section `state`
 * lines when `sectionsChanged` says so, `event` lines for moments, a `ping`
 * every 15 s, back-pressure. Wires the sources: `onServiceEvent`,
 * `onSettingsChange`, `onJobsChange` (throttled to
 * `LOCAL_API_LIMITS.jobsPushMinMs`, and read from memory only), and a 15 s
 * timer for OBS and the drive that runs only while somebody is subscribed.
 *
 * May import: `@shared/localApi`, `./snapshot.js`, `./session.js`
 * (`openSession`, `getSession`, to remember what a line sent),
 * `../../startup.js`, `../jobs.js`, `../capture/*`, `../../settings.js`.
 * Never `server.js`, `routes.js`, `index.js`, `pipe.js`, `discovery.js`.
 * Imported by: `server.ts` (`subscribe`), `index.ts` (`startStream`, `stopStream`).
 *
 * Past `LOCAL_API_LIMITS.backpressureBytes` unwritten, that subscriber is
 * dropped; at most `maxSubscribers`. Every line a subscriber is sent goes
 * through `SessionSeen.rememberLine` first, so a write can only name ids the
 * client was told.
 *
 * A session is touched by every line its stream writes, pings included, so it
 * cannot expire under a stream that is still open. It is not closed when the
 * stream ends: a client that reconnects within the ttl and then writes with the
 * old id is not punished for a dropped pipe.
 */
import type { ServerResponse } from 'node:http';
import {
  LOCAL_API_LIMITS,
  NDJSON_CONTENT_TYPE,
  encodeLine,
  stateDelta,
  type EventLine,
  type LocalApiErrorCode,
  type LocalApiEvent,
  type LocalApiLine,
  type LocalApiState,
} from '@shared/localApi';
import { onSettingsChange } from '../../settings.js';
import { onServiceEvent, type ServiceEvent } from '../../startup.js';
import { onJobsChange } from '../jobs.js';
import { getSession, openSession } from './session.js';
import {
  apiClipById,
  buildJobs,
  buildState,
  clearPublished,
  confirmSaving,
  gameSlug,
  noteSaved,
  noteSaving,
  refreshSlow,
  setPublished,
} from './snapshot.js';
import { ProgressThrottle, isBackedUp, needsPing, throttleDelay } from './streamShape.js';

interface Subscriber {
  res: ServerResponse;
  sessionId: string;
  lastWrite: number;
}

/** How often the ping timer looks for a quiet subscriber. */
const TICK_MS = 5_000;
/** State changes that arrive in a burst are folded into one read. */
const REFRESH_DEBOUNCE_MS = 300;
/** Upload progress lines per clip, at most this often. */
const PROGRESS_MIN_MS = 500;

const subs = new Set<Subscriber>();
let started = false;
let rev = 0;
/** What every subscriber has been told, as whole sections. Null while nobody listens. */
let last: LocalApiState | null = null;
let detachers: Array<() => void> = [];
let tickTimer: ReturnType<typeof setInterval> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let jobsTimer: ReturnType<typeof setTimeout> | null = null;
let savingTimer: ReturnType<typeof setTimeout> | null = null;
let jobsAt: number | null = null;
let running: Promise<void> | null = null;
let again = false;
const progress = new ProgressThrottle(PROGRESS_MIN_MS);

function log(message: string, error?: unknown): void {
  console.error(`[local-api] ${message}`, error instanceof Error ? error.message : (error ?? ''));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function dropSubscriber(sub: Subscriber, destroy: boolean): void {
  if (!subs.delete(sub)) return;
  if (destroy) {
    try {
      sub.res.destroy();
    } catch {
      // Already gone.
    }
  }
  if (subs.size === 0) idle();
}

function send(sub: Subscriber, line: LocalApiLine): void {
  const now = Date.now();
  const session = getSession(sub.sessionId, now);
  // Remembered before the write, so a client can never act on an id it was
  // sent that this session did not record.
  session?.rememberLine(line);
  session?.touch(now);
  try {
    sub.res.write(encodeLine(line));
    sub.lastWrite = now;
  } catch (error) {
    log('write failed, dropping subscriber', error);
    dropSubscriber(sub, true);
    return;
  }
  if (isBackedUp(sub.res.writableLength, LOCAL_API_LIMITS.backpressureBytes)) {
    log('subscriber is not reading, dropping it');
    dropSubscriber(sub, true);
  }
}

function broadcast(line: LocalApiLine): void {
  for (const sub of [...subs]) send(sub, line);
}

function emitEvent(event: LocalApiEvent): void {
  if (subs.size === 0) return;
  rev += 1;
  broadcast({ type: 'event', rev, ...event } as EventLine);
}

/** Make `next` the truth: tell everybody which whole sections differ from what they hold. */
function applyState(next: LocalApiState): void {
  const delta = stateDelta(last, next);
  last = next;
  if (delta === null) {
    setPublished(rev, next);
    return;
  }
  rev += 1;
  setPublished(rev, next);
  broadcast({ type: 'state', rev, set: delta });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** One build at a time; a request that arrives during one runs another straight after. */
function refresh(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        const state = await buildState();
        if (subs.size > 0) applyState(state);
      } catch (error) {
        log('could not build the state', error);
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

function scheduleRefresh(delayMs = REFRESH_DEBOUNCE_MS): void {
  if (subs.size === 0 || refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, delayMs);
  refreshTimer.unref?.();
}

function pushJobs(): void {
  jobsAt = Date.now();
  if (subs.size === 0 || !last) return;
  // Memory only: progress arrives per ffmpeg tick and must never reach the database.
  applyState({ ...last, jobs: buildJobs() });
}

function onJobs(): void {
  if (subs.size === 0 || jobsTimer) return;
  const delay = throttleDelay(jobsAt, Date.now(), LOCAL_API_LIMITS.jobsPushMinMs);
  if (delay === 0) {
    pushJobs();
    return;
  }
  jobsTimer = setTimeout(() => {
    jobsTimer = null;
    pushJobs();
  }, delay);
  jobsTimer.unref?.();
}

function armSavingTimer(): void {
  if (savingTimer) clearTimeout(savingTimer);
  // A receipt that never comes must not leave "saving" on for the night.
  savingTimer = setTimeout(() => {
    savingTimer = null;
    void refresh();
  }, LOCAL_API_LIMITS.savingFallbackMs + 50);
  savingTimer.unref?.();
}

function disarmSavingTimer(): void {
  if (savingTimer) clearTimeout(savingTimer);
  savingTimer = null;
}

function onEvent(event: ServiceEvent): void {
  const at = new Date().toISOString();
  switch (event.type) {
    case 'clip-saving':
      noteSaving();
      armSavingTimer();
      emitEvent({ event: 'clip.saving', at });
      scheduleRefresh(0);
      return;
    case 'clip-saved': {
      noteSaved();
      disarmSavingTimer();
      if (subs.size === 0) return;
      void (async () => {
        // The state first, so `latest` already names the clip the event carries.
        await refresh();
        const clip = await apiClipById(event.clipId);
        if (clip) emitEvent({ event: 'clip.saved', at, clip });
      })().catch((error) => log('could not announce the saved clip', error));
      return;
    }
    case 'sweep-started':
      emitEvent({ event: 'sweep.started', at, game: gameSlug(event.game), clips: event.clips });
      return;
    case 'sweep-finished':
      emitEvent({ event: 'sweep.finished', at, found: event.found, clips: event.clips, clipIds: event.clipIds });
      scheduleRefresh();
      return;
    case 'sweep-dismissed':
      emitEvent({ event: 'sweep.dismissed', at });
      return;
    case 'publish-progress':
      if (progress.allow(event.clipId, event.stage, event.percent, Date.now())) {
        emitEvent({
          event: 'publish.progress',
          at,
          clipId: event.clipId,
          name: event.name,
          stage: event.stage,
          percent: event.percent,
          ...(event.message === undefined ? {} : { message: event.message }),
        });
      }
      if (event.stage === 'done') scheduleRefresh();
      return;
    case 'trim-progress':
      if (event.stage !== 'cutting') scheduleRefresh();
      return;
    case 'obs-setup-progress':
      if (event.stage === 'done' && subs.size > 0) void refreshSlow().then(() => refresh());
      return;
    case 'clip-added':
    case 'clip-ready':
    case 'clip-removed':
    case 'clip-analyzed':
    case 'scan-finished':
      scheduleRefresh();
      return;
    case 'scan-started':
      return;
  }
}

// ---------------------------------------------------------------------------
// Timers: running only while somebody is subscribed
// ---------------------------------------------------------------------------

function busy(): void {
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      const now = Date.now();
      for (const sub of [...subs]) {
        if (needsPing(sub.lastWrite, now, LOCAL_API_LIMITS.pingMs)) {
          send(sub, { type: 'ping', rev, at: new Date(now).toISOString() });
        }
      }
    }, TICK_MS);
    tickTimer.unref?.();
  }
  if (!slowTimer) {
    slowTimer = setInterval(() => {
      void (async () => {
        await refreshSlow();
        await confirmSaving();
        await refresh();
      })().catch((error) => log('slow refresh failed', error));
    }, LOCAL_API_LIMITS.slowPollMs);
    slowTimer.unref?.();
  }
}

function idle(): void {
  if (tickTimer) clearInterval(tickTimer);
  if (slowTimer) clearInterval(slowTimer);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (jobsTimer) clearTimeout(jobsTimer);
  tickTimer = slowTimer = refreshTimer = jobsTimer = null;
  last = null;
  clearPublished();
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

/**
 * Take over `res` as an NDJSON stream: headers, a snapshot line, then pushes.
 * Resolves `{ ok: false }` without touching `res` when refused (`too_many_streams`, `starting`).
 */
export async function subscribe(
  res: ServerResponse,
): Promise<{ ok: true; session: string } | { ok: false; error: LocalApiErrorCode }> {
  if (!started) return { ok: false, error: 'starting' };
  if (subs.size >= LOCAL_API_LIMITS.maxSubscribers) return { ok: false, error: 'too_many_streams' };

  let state: LocalApiState;
  try {
    state = await buildState();
  } catch (error) {
    log('could not build the first snapshot', error);
    return { ok: false, error: 'starting' };
  }
  // Both can have changed while the state was being read.
  if (!started) return { ok: false, error: 'starting' };
  if (subs.size >= LOCAL_API_LIMITS.maxSubscribers) return { ok: false, error: 'too_many_streams' };
  if (res.destroyed || res.writableEnded) return { ok: false, error: 'starting' };

  // Anybody already listening hears whatever this read found that they lack,
  // so the newcomer's snapshot is never ahead of the stream it joins.
  if (subs.size > 0) applyState(state);
  else {
    last = state;
    setPublished(rev, state);
  }

  const sessionId = openSession();
  res.writeHead(200, {
    'Content-Type': NDJSON_CONTENT_TYPE,
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
  });
  try {
    res.socket?.setNoDelay(true);
    res.socket?.setTimeout(0);
  } catch {
    // Not every transport has a socket to tune.
  }
  res.flushHeaders();

  const sub: Subscriber = { res, sessionId, lastWrite: Date.now() };
  subs.add(sub);
  res.on('close', () => dropSubscriber(sub, false));
  res.on('error', () => dropSubscriber(sub, true));
  busy();

  send(sub, { type: 'snapshot', rev, session: sessionId, state });
  return { ok: true, session: sessionId };
}

/** Attach the sources. Idle (no timers, no reads) until the first subscriber. */
export function startStream(): void {
  if (started) return;
  started = true;
  detachers = [
    onServiceEvent(onEvent),
    onSettingsChange(() => scheduleRefresh()),
    onJobsChange(onJobs),
  ];
}

/** Detach the sources and end every subscriber's response. */
export function stopStream(): void {
  started = false;
  for (const detach of detachers) detach();
  detachers = [];
  disarmSavingTimer();
  for (const sub of [...subs]) {
    subs.delete(sub);
    try {
      sub.res.end();
    } catch {
      // Already gone.
    }
  }
  idle();
}

export function subscriberCount(): number {
  return subs.size;
}
