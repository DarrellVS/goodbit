/**
 * The notch: a strip of black on the edge of the screen that says a clip was
 * saved, and, on a quiet desktop, stays as a thin status line that opens when
 * the pointer rests on it.
 *
 * It replaced the corner card (`clipToast.ts`), and it keeps that card's
 * contract whole, because every part of it was paid for:
 *
 * - **Two states, one shape.** "Saving your clip" the instant a file lands in
 *   staging, becoming "Clip saved · Game · 0:30" once the row exists. The wait
 *   is the reason this exists, so the wait is what it shows.
 * - **The receipt fires on the row, never on the key.** Saying "saved" about a
 *   buffer that was not running is worse than saying nothing.
 * - **The first state names no game.** It could only guess from what is in
 *   front now, and the whole point of attributing over the clip's own window is
 *   that the instant reading is usually wrong.
 * - **Nothing about it may disturb a game.** `focusable: false` and
 *   `showInactive()`, so it can never alt-tab anybody out of a firefight;
 *   click-through except while it is open under the pointer; the
 *   `'screen-saver'` level, because plain always-on-top loses to a maximised
 *   game; and built at boot, because latency is the product.
 *
 * ## What stays on screen between peeks
 *
 * With "keep it on the desktop" on, a line of 120 by 4 pixels in the middle of
 * the edge, coloured by state. It goes away entirely while a game is in front
 * or anything covers its whole monitor, a fullscreen video as much as a
 * borderless game (`restingMode`). A peek in a game therefore opens out of
 * nothing and folds back into nothing; on the desktop it grows out of the line
 * and settles back into it.
 *
 * ## Who decides what
 *
 * This file decides and the notch page (`components/Notch/`) draws, with
 * motion-v springs between shapes. It gets one whole `NotchState` whenever
 * anything changes, over a bridge of its own. Settings go through
 * `resolveNotch`, the hover timing through `stepHover`, where it sits through
 * `placement.ts`; all three are pure and owned by `tests/unit`.
 */
import { invisibleForTests } from '../../testMode.js';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { basename, dirname, join } from 'node:path';
import { notchDwellMs, notchLeaveMs, resolveNotch, type NotchPlan } from '@shared/notchSettings.js';
import {
  NOTCH_ISLAND,
  NOTCH_PEEK,
  NOTCH_STAGE,
  NOTCH_ZONE,
  type NotchAction,
  type NotchChime,
  type NotchIsland,
  type NotchMode,
  type NotchPeek,
  type NotchResult,
  type NotchState,
} from '@shared/notch.js';
import { loadSettings, onSettingsChange, saveSettings } from '../../settings.js';
import { IDLE, POLL_MS, restingMode, stepHover, type HoverState, type Rect } from './hover.js';
import { hanging, stageToScreen, windowBounds } from './placement.js';
import { islandData, libraryDisk, lineState, type Disk } from './status.js';

/**
 * How long the saving peek waits for a receipt before giving up on itself.
 *
 * Indexing can fail, and a notch that says "Saving your clip" for ever is a
 * worse bug than the one it was reporting on.
 */
const SAVING_TIMEOUT_MS = 45_000;

/** How long the finished peek stays before it folds. */
const PEEK_SHOW_MS = 3600;

/**
 * Long enough for the fold to settle before the window is parked.
 *
 * Generously so: the spring's visual duration is not its whole tail, and the
 * last frame painted before parking is the first frame seen at the next reveal.
 * Parked mid-fold, the next peek would open out of half a shape.
 */
const FOLD_MS = 700;


/** How often OBS and the drive are looked at while the line is showing. */
const STATUS_REFRESH_MS = 15_000;

const STAGE = NOTCH_STAGE;

let win: BrowserWindow | null = null;
let pageReady = false;
let mode: NotchMode = 'hidden';
let bounds: Rect | null = null;
let parked = true;
let plan: NotchPlan = resolveNotch({});
let dwellMs = notchDwellMs({});
let leaveMs = notchLeaveMs({});
let peekContent: NotchPeek | null = null;
let island: NotchIsland | null = null;
/** What the last sweep found, while its peek or its card is up. */
let result: NotchResult | null = null;
/** Which card `open` is showing: today's island, or the sweep's result. */
let opened: 'island' | 'result' = 'island';

let peekTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let statusTimer: ReturnType<typeof setInterval> | null = null;
let hover: HoverState = IDLE;

// What the line is reporting on.
let saving = false;
let savingTimer: ReturnType<typeof setTimeout> | null = null;
let fullscreen = false;
let gameInFront = false;
let obsInstalled = false;
let obsRunning = false;
let disk: Disk | null = null;

let opener: ((path: string) => void) | null = null;
let detachers: Array<() => void> = [];

/** How the notch reaches the app window. Registered by `index.ts`, which owns it. */
export function setNotchOpener(open: (path: string) => void): void {
  opener = open;
}

/**
 * Write down what `notch` is, the first time a boot sees it unset.
 *
 * `resolveNotch` derives it from the corner card's switch, so somebody who
 * had turned the card off does not get a line they never asked for. Written
 * rather than left derived, or switching off "say when a clip is saved" later
 * would take the whole notch with it.
 */
export function settleNotchSetting(): void {
  const settings = loadSettings();
  if (settings.notch !== undefined) return;
  saveSettings({ notch: settings.clipToast !== false });
}

function snapshot(): NotchState {
  return {
    mode,
    line: lineState({ saving, obsInstalled, obsRunning, disk }),
    peek: mode === 'peek' ? peekContent : null,
    island: mode === 'open' && opened === 'island' ? island : null,
    result: mode === 'open' && opened === 'result' ? result : null,
  };
}

/** Send the whole state. Cheap, and it means the page can never hold half of one. */
function publish(): void {
  if (!win || win.isDestroyed() || !pageReady) return;
  win.webContents.send('notch:state', snapshot());
}

function sendChime(kind: NotchChime): void {
  if (!win || win.isDestroyed() || !pageReady) return;
  win.webContents.send('notch:chime', kind, Number(loadSettings().clipToastVolume ?? 75));
}

/**
 * A file out of the build, found by walking up to the `out` folder.
 *
 * Not a fixed `../` from `import.meta.dirname`: this module is a dynamic
 * import, bundled into `out/main/chunks/`, and whether it stays a chunk is the
 * bundler's call. Not `app.getAppPath()` either: launched as
 * `electron out/main/index.js`, which is how the e2e suite starts it, that is
 * `out/main` rather than the project.
 */
function fromBuild(...parts: string[]): string {
  let dir = import.meta.dirname;
  while (basename(dir) !== 'out' && dirname(dir) !== dir) dir = dirname(dir);
  const out = basename(dir) === 'out' ? dir : join(app.getAppPath(), 'out');
  return join(out, ...parts);
}

function build(): BrowserWindow {
  const created = new BrowserWindow({
    width: STAGE.along,
    height: STAGE.across,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // Never takes focus, not even while open under the pointer. Clicks still
    // land on its buttons; the game or the window behind keeps the keyboard.
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: fromBuild('preload', 'notch.mjs'),
      // The same shape as the app window: an ESM preload cannot run sandboxed,
      // and isolation is what keeps the page away from Node.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // It animates while it sits behind nothing and in front of everything;
      // a throttled timer would stutter the spring.
      backgroundThrottling: false,
    },
  });

  created.setAlwaysOnTop(true, 'screen-saver');
  created.setIgnoreMouseEvents(true);

  // Windows animates a window being shown, a short slide up and fade, and on
  // the notch that read as it rising from below before dropping from the top.
  // It is shown and hidden every time a game or a fullscreen video comes and
  // goes, so the system's animation is turned off and only the notch's own
  // spring plays.
  if (process.platform === 'win32') {
    const handle = created.getNativeWindowHandle();
    const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
    void import('../capture/foregroundHistory.js').then(({ disableWindowTransitions }) =>
      disableWindowTransitions(hwnd),
    );
  }
  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Nothing on the notch navigates or opens anything by itself.
  created.webContents.on('will-navigate', (event) => event.preventDefault());
  created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  pageReady = false;
  if (process.env.ELECTRON_RENDERER_URL) {
    void created.loadURL(`${process.env.ELECTRON_RENDERER_URL}/notch.html`);
  } else {
    void created.loadFile(fromBuild('renderer', 'notch.html'));
  }

  created.on('closed', () => {
    win = null;
    pageReady = false;
  });
  return created;
}

function ensureWindow(): BrowserWindow {
  if (!win || win.isDestroyed()) {
    win = build();
    // Shown once, out of sight, and from then on only ever moved.
    park(win);
  }
  return win;
}

let ipcRegistered = false;

function registerIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on('notch:ready', (event) => {
    if (!win || event.sender !== win.webContents) return;
    pageReady = true;
    publish();
  });

  ipcMain.on('notch:action', (event, action: NotchAction) => {
    if (!win || event.sender !== win.webContents) return;
    const latest = island?.latest?.id;
    if (action === 'trim' && latest != null) opener?.(`/trim/${latest}`);
    else if (action === 'open-latest' && latest != null) opener?.(`/clips/${latest}`);
    else if (action === 'library') opener?.('/');
    else if (action === 'edit-highlights' && result?.clipIds.length) {
      opener?.(`/editor?clips=${result.clipIds.join(',')}&highlights=1`);
    }
    if (opened === 'result') result = null;
    setMode(resting());
  });
}

/**
 * Put the window on its edge, on the display the pointer is on.
 *
 * Only while nothing is showing: moving a visible notch makes it jump across
 * the screen mid-sequence. A peek therefore lands on whichever screen is being
 * played on, and the line stays where it first appeared until it next folds.
 */
function place(target: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  bounds = windowBounds(display.workArea, STAGE);
  target.setBounds(bounds);
  parked = false;
}

/**
 * Put the window out of the way without hiding it: one transparent pixel at
 * the middle of the edge.
 *
 * Hiding and showing it again was how the notch went away and came back, and
 * showing a window is something Windows animates: the notch rose from below
 * before its own drop played. Moving it off every screen instead was measured
 * and was worse in a different way: Windows counts a window that was just
 * off-screen as hidden for a moment, Chromium presents nothing for it, and the
 * first frame seen was the finished peek, popped in. A one pixel window is
 * never hidden and never off-screen, so the page keeps painting, and growing it
 * back is a resize, which nothing animates. One click-through pixel overlaps
 * nothing anybody could notice.
 */
function park(target: BrowserWindow): void {
  const anchor =
    bounds ?? windowBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, STAGE);
  target.setBounds({ x: Math.round(anchor.x + anchor.width / 2), y: anchor.y, width: 1, height: 1 });
  parked = true;
  if (!target.isVisible()) {
    // The e2e suite runs on somebody's desktop; the notch is there and
    // working, and not seen.
    if (invisibleForTests) target.setOpacity(0);
    target.showInactive();
  }
}

function resting(): 'line' | 'hidden' {
  if (!plan.enabled) return 'hidden';
  return restingMode({ line: plan.line, fullscreen, game: gameInFront });
}

/** Move to a mode: show, hide, click-through and polling all follow from it. */
function setMode(next: NotchMode): void {
  if (!plan.enabled && next !== 'hidden') next = 'hidden';
  const previous = mode;
  mode = next;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  if (next === 'hidden') {
    const target = win;
    if (target && !target.isDestroyed()) {
      target.setIgnoreMouseEvents(true);
      publish();
      // Parked only once the fold has settled, or it vanishes mid-spring.
      hideTimer = setTimeout(() => {
        if (mode === 'hidden' && !target.isDestroyed()) park(target);
      }, FOLD_MS);
    }
  } else {
    const target = ensureWindow();
    if (parked || !target.isVisible()) {
      if (!target.isVisible()) park(target);
      place(target);
    }
    target.setIgnoreMouseEvents(next !== 'open');
    publish();
  }

  if (next !== 'open') hover = IDLE;
  if (previous !== next) syncTimers();
}

/** The cursor poll runs only while there is a line or an island to hover. */
/** A found peek can be opened, so the pointer is watched while it is up. */
function foundPeek(): boolean {
  return mode === 'peek' && peekContent?.state === 'found' && result !== null;
}

function syncTimers(): void {
  const hoverable = mode === 'line' || mode === 'open' || foundPeek();
  if (hoverable && !pollTimer) pollTimer = setInterval(poll, POLL_MS);
  if (!hoverable && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const watching = plan.enabled && (mode === 'line' || resting() === 'line');
  if (watching && !statusTimer) {
    statusTimer = setInterval(() => void refresh(), STATUS_REFRESH_MS);
    void refresh();
  }
  if (!watching && statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function poll(): void {
  const peeking = foundPeek();
  if (!bounds || (mode !== 'line' && mode !== 'open' && !peeking)) return;
  const point = screen.getCursorScreenPoint();
  // A found peek is the zone itself: the whole bar, not the thin strip over the line.
  const zone = peeking
    ? stageToScreen(bounds, hanging(STAGE, NOTCH_PEEK.width + 80, NOTCH_PEEK.height + 8))
    : stageToScreen(bounds, hanging(STAGE, NOTCH_ZONE.width, NOTCH_ZONE.height));
  const openRect = stageToScreen(bounds, hanging(STAGE, NOTCH_ISLAND.width, NOTCH_ISLAND.height));

  const before = hover.phase;
  const step = stepHover(hover, { now: Date.now(), point, zone, island: openRect, dwellMs, leaveMs });
  hover = step.state;

  if (peeking) {
    // Resting on the peek holds it; it would be rude to fold under the pointer.
    if (step.state.phase === 'dwelling' && peekTimer) {
      clearTimeout(peekTimer);
      peekTimer = null;
    }
    // Moved off before it opened: fold a moment later, as it would have.
    if (before === 'dwelling' && step.state.phase === 'idle' && !peekTimer) {
      peekTimer = setTimeout(endPeek, Math.max(leaveMs, 1200));
    }
    if (step.action === 'open') {
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = null;
      opened = 'result';
      setMode('open');
    }
    return;
  }

  // The pointer has just arrived: read the island now, during the wait, so the
  // moment it opens there is something current to show.
  if (before === 'idle' && step.state.phase === 'dwelling') void refreshIsland();
  if (step.action === 'open' && mode === 'line') {
    opened = 'island';
    setMode('open');
  }
  if (step.action === 'close') {
    // The result card is read once; it does not come back from the line.
    if (opened === 'result') result = null;
    setMode(resting());
  }
}

async function refreshIsland(): Promise<void> {
  try {
    island = await islandData({ obsInstalled, obsRunning, disk });
    if (mode === 'open') publish();
  } catch (error) {
    console.warn('[notch] could not read the island:', (error as Error).message);
  }
}

/** OBS, the drive and the island, off the path of anything the pointer does. */
async function refresh(): Promise<void> {
  try {
    const { obsIsInstalled, obsIsRunning } = await import('../obs/paths.js');
    [obsInstalled, obsRunning, disk] = await Promise.all([
      obsIsInstalled(),
      obsIsRunning(),
      libraryDisk(),
    ]);
  } catch (error) {
    console.warn('[notch] could not read the status:', (error as Error).message);
  }
  await refreshIsland();
  if (mode === 'line') publish();
}

/** Something in front changed. Only the resting state cares; a peek finishes first. */
function reconsider(): void {
  const want = resting();
  if ((mode === 'line' || mode === 'open') && want === 'hidden') setMode('hidden');
  else if (mode === 'hidden' && want === 'line' && !peekTimer) setMode('line');
  syncTimers();
}

// Executables known to be games, and the ones already asked about. The same
// shape `sessionWatch` uses: the answer for one executable never changes
// within a session, and the question is async while the decision is not.
const knownGames = new Set<string>();
const asked = new Set<string>();

function askAbout(exePath: string): void {
  const key = exePath.toLowerCase();
  if (!exePath || asked.has(key)) return;
  asked.add(key);
  void import('../capture/gameNames.js')
    .then(({ isKnownGame }) => isKnownGame(exePath))
    .then((known) => {
      if (!known) return;
      knownGames.add(key);
      if (!gameInFront) reconsider();
    })
    .catch(() => {
      // Cannot tell, so not a game: the fullscreen test still covers the
      // borderless ones.
    });
}

function applySettings(): void {
  const settings = loadSettings();
  plan = resolveNotch(settings);
  dwellMs = notchDwellMs(settings);
  leaveMs = notchLeaveMs(settings);

  if (!plan.enabled) {
    setMode('hidden');
    syncTimers();
    return;
  }
  if (!peekTimer && !(mode === 'open' && resting() === 'line')) setMode(resting());
  syncTimers();
}

/**
 * Build the window, load the page and start listening, at boot.
 *
 * Constructing a window and loading a page is most of a second, and it used to
 * land between the key going down and the card appearing, which is the one
 * moment where latency is the whole product.
 */
export async function warmNotch(): Promise<void> {
  settleNotchSetting();
  registerIpc();
  const settings = loadSettings();
  plan = resolveNotch(settings);
  dwellMs = notchDwellMs(settings);
  leaveMs = notchLeaveMs(settings);

  if (detachers.length === 0) {
    const history = await import('../capture/foregroundHistory.js');
    fullscreen = history.foregroundIsFullscreen();
    detachers.push(
      onSettingsChange(() => applySettings()),
      history.onFullscreenChange((now) => {
        fullscreen = now;
        reconsider();
      }),
      history.onForegroundSample((sample) => {
        askAbout(sample.exePath);
        const now = !!sample.exePath && knownGames.has(sample.exePath.toLowerCase());
        if (now !== gameInFront) {
          gameInFront = now;
          reconsider();
        }
      }),
    );
  }

  if (!plan.enabled) return;
  ensureWindow();
  await refresh();
  setMode(resting());
  syncTimers();
}

interface PeekOptions {
  chime: NotchChime | null;
  enabled: boolean;
  /** How long it stays. The caller's, because only the caller knows. */
  lingerMs?: number;
}

function peek(content: NotchPeek, { chime, enabled, lingerMs }: PeekOptions): void {
  const began = Date.now();
  if (!enabled) return;

  if (peekTimer) clearTimeout(peekTimer);
  peekTimer = null;

  peekContent = content;
  // Anything but the found peek leaves the last result behind.
  if (content.state !== 'found') result = null;
  // A peek wins over an open island: the island folds into the peek.
  setMode('peek');
  if (chime) sendChime(chime);

  // The one number worth watching in this file.
  console.log(`[notch] ${content.state} in ${Date.now() - began}ms`);

  const settled = content.state === 'saved' || content.state === 'found';
  const linger = lingerMs ?? (settled ? PEEK_SHOW_MS : SAVING_TIMEOUT_MS);
  peekTimer = setTimeout(endPeek, linger);
}

/**
 * Fold the peek into whatever is right *now*, not what was right when it
 * opened: a game started or closed during it decides between line and nothing.
 */
function endPeek(): void {
  if (peekTimer) clearTimeout(peekTimer);
  peekTimer = null;
  if (mode !== 'peek') return;
  result = null;
  setMode(resting());
}

function lineMoved(): void {
  if (mode === 'line') publish();
}

/** A replay has landed in staging and is being filed. No game yet, on purpose. */
export async function showClipSaving(): Promise<void> {
  try {
    saving = true;
    // A receipt that never comes must not leave the line busy for the night.
    if (savingTimer) clearTimeout(savingTimer);
    savingTimer = setTimeout(() => {
      saving = false;
      lineMoved();
    }, SAVING_TIMEOUT_MS);

    peek(
      { state: 'saving', title: 'Saving your clip', subtitle: 'Filing it into your library' },
      { chime: plan.clipSound ? 'saving' : null, enabled: plan.clipPeek },
    );
    // Without a peek the line still moves, which is all it has to say.
    lineMoved();
  } catch (error) {
    console.error('[notch]', error instanceof Error ? error.message : error);
  }
}

/** The clip is indexed and openable. The half of the phrase that resolves. */
export async function showClipSaved(subtitle: string): Promise<void> {
  try {
    saving = false;
    if (savingTimer) clearTimeout(savingTimer);
    savingTimer = null;
    void refreshIsland();
    lineMoved();
    peek(
      { state: 'saved', title: 'Clip saved', subtitle },
      { chime: plan.clipSound ? 'saved' : null, enabled: plan.clipPeek },
    );
  } catch (error) {
    console.error('[notch]', error instanceof Error ? error.message : error);
  }
}

/**
 * The sweep has started. Silent whatever the settings say: it fires as
 * somebody closes a game, which is often the moment they get up.
 */
export async function showSweepStarted(clips: number, game: string, lingerMs: number): Promise<void> {
  try {
    peek(
      {
        state: 'finding',
        title: 'Looking for GoodBits',
        subtitle: `${clips} ${clips === 1 ? 'clip' : 'clips'} from ${game}`,
      },
      { chime: null, enabled: plan.sweepPeek, lingerMs },
    );
  } catch (error) {
    console.error('[notch]', error instanceof Error ? error.message : error);
  }
}

/** The sweep found something. Only called when there is something to report. */
export async function showSweepFinished(
  found: number,
  clips: number,
  clipIds: number[] = [],
): Promise<void> {
  try {
    // Set before the peek, so the pointer watch it starts knows it can open.
    result = clipIds.length ? { found, clips, clipIds } : null;
    peek(
      {
        state: 'found',
        title: `Found ${found} ${found === 1 ? 'GoodBit' : 'GoodBits'}`,
        subtitle: `in ${clips} ${clips === 1 ? 'clip' : 'clips'}, ready to trim`,
      },
      { chime: plan.sweepSound ? 'found' : null, enabled: plan.sweepPeek },
    );
    syncTimers();
  } catch (error) {
    console.error('[notch]', error instanceof Error ? error.message : error);
  }
}

/** Take a peek down now, without a receipt: a sweep that was cancelled or found nothing. */
export function dismissPeek(): void {
  endPeek();
}

/** The whole clip sequence, from Settings, so it can be judged rather than guessed at. */
export async function previewClipPeek(): Promise<void> {
  await showClipSaving();
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await showClipSaved('Battlefield 6 · 0:30');
}

/** A few real clip ids for the preview, so its button opens something. */
function previewClipIds(): number[] {
  return island?.latest ? [island.latest.id] : [];
}

/** The sweep's pair, from Settings, for the same reason. */
export async function previewSweepPeek(): Promise<void> {
  await showSweepStarted(12, 'Battlefield 6', 8000);
  await new Promise((resolve) => setTimeout(resolve, 1900));
  await showSweepFinished(4, 12, previewClipIds());
}

export function closeNotch(): void {
  for (const detach of detachers) detach();
  detachers = [];
  for (const timer of [peekTimer, hideTimer, savingTimer]) if (timer) clearTimeout(timer);
  if (pollTimer) clearInterval(pollTimer);
  if (statusTimer) clearInterval(statusTimer);
  peekTimer = hideTimer = savingTimer = null;
  pollTimer = statusTimer = null;
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
  mode = 'hidden';
}
