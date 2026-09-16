import { BrowserWindow, screen } from 'electron';
import { loadSettings } from '../settings.js';

/**
 * "Clip saved", said over the game.
 *
 * The replay buffer is a thing you press and then hope about. OBS itself gives
 * no feedback worth the name, the window is behind a game, and the clip does
 * not appear in the library for several seconds after the key goes down. So the
 * only way to know it worked used to be to alt-tab and look, which is exactly
 * what nobody wants to do in the moment worth clipping.
 *
 * ## Two cards, or rather one card twice
 *
 * The wait is the reason this exists, so the wait is the thing to show. The
 * first card appears the instant a file lands in staging and says the clip is
 * being saved; the same card then becomes "Clip saved" once the row exists.
 * A single card that only appears at the end would leave the uncertain seconds
 * exactly as uncertain as they were.
 *
 * **The second state fires on the row existing, not on the key.** The key only
 * says a request was made, not that a file arrived, was attributed to a game
 * and was indexed; any of those can fail, and saying "saved" about a buffer
 * that was not running is worse than saying nothing. The first card is a
 * promise, the second is the receipt.
 *
 * **The first card names no game.** It would have to guess from whatever is in
 * front right now, and the whole reason attribution is a vote over the clip's
 * own window is that the instant reading is often wrong: the user has usually
 * alt-tabbed by the time the file lands. A guess that the second card then
 * contradicts is worse than no guess.
 *
 * ## The window
 *
 * Every option here is about not disturbing a game.
 *
 * - **`focusable: false` and `showInactive()`.** A window that takes focus
 *   alt-tabs the player out of a firefight. This one can never hold focus.
 * - **`setIgnoreMouseEvents(true)`.** Clicks pass through to whatever is
 *   underneath, so the toast cannot eat a shot.
 * - **`'screen-saver'` always-on-top level.** Plain `alwaysOnTop` loses to a
 *   maximised game; this level is above it.
 * - **On the screen the pointer is on**, not the primary one. The game is where
 *   the mouse is.
 * - **The card is opaque.** It was 92% for a while and whatever sat behind it
 *   bled through: over a title bar, a button from the app underneath showed up
 *   inside the card and read as a control of ours. Only the window around the
 *   card is transparent, and only so the shadow and the rounded corners have
 *   somewhere to fall.
 *
 * **What this cannot do**, and it is worth being straight about: a game running
 * in *exclusive* fullscreen owns the display outright, and nothing drawn by
 * another window reaches it. Borderless windowed, which is the default in most
 * modern games and what OBS display capture wants anyway, works fine.
 *
 * ## The sound
 *
 * Synthesised rather than shipped. Two short sine notes, C6 into E6, with a
 * quick decay: a rising pair reads as "done" where a single beep reads as
 * "attention", and at 120 ms it is under the length of a footstep. Generating
 * it in the page means no asset to package, no codec to depend on, and the
 * pitch and length are a line of code rather than a re-recording. It plays on
 * the second card only; chiming twice for one clip would be nagging.
 */

/** How long the finished card stays up. */
const SHOW_MS = 3600;

/**
 * How long the saving card waits for a receipt before giving up on itself.
 *
 * Indexing can fail, and a card that says "Saving your clip" for ever is a
 * worse bug than the one it was reporting on.
 */
const SAVING_TIMEOUT_MS = 45_000;

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const WIDTH = 344;
/**
 * Sized to the content, not to a round number.
 *
 * The badge is 32 and the two lines come to about 34, so anything much over 70
 * is empty space above and below the only thing on the card. At 96 it read as a
 * panel rather than a notification.
 */
const HEIGHT = 70;
/**
 * Room inside the window for the shadow to fall without being clipped.
 *
 * A transparent window still has edges, and anything the card paints outside
 * them is cut off square: the drop shadow ended in a hard line down the right
 * hand side and read as a broken card. This has to cover the shadow's furthest
 * reach, which is its blur plus its downward offset, so the two numbers below
 * are chosen against this one rather than by eye.
 */
const BLEED = 32;

/**
 * The gap between the visible card and the edge of the screen.
 *
 * Never less than the bleed. The window is positioned at `MARGIN - BLEED` from
 * the edge, so a smaller margin would push the window partly off screen, and
 * Windows answers that by shoving it back, which moves the card instead of the
 * empty pixels around it.
 */
const MARGIN = 32;

let overlay: BrowserWindow | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The whole overlay, as one page.
 *
 * A data URL rather than a file, because this is the only thing in the app that
 * is not part of the renderer bundle and giving it a build entry of its own
 * would be more configuration than markup. Nothing here loads from anywhere.
 */
function page(): string {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        --bleed: ${BLEED}px;
        --orange: #f97316;
      }
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background: transparent;
        overflow: hidden;
        font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        -webkit-user-select: none;
        cursor: default;
      }

      #card {
        box-sizing: border-box;
        position: absolute;
        inset: var(--bleed);
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 0 18px;
        border-radius: 15px;
        /* Fully opaque. Anything translucent picks up whatever is behind it,
           and what is behind it is usually a game or a title bar. */
        background: #16171c;
        border: 1px solid rgba(255, 255, 255, 0.075);
        /* Offset plus blur must stay within --bleed, or the window edge cuts
           the shadow off in a straight line. 10 + 22 = 32. */
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.05) inset,
          0 10px 22px rgba(0, 0, 0, 0.5),
          0 2px 6px rgba(0, 0, 0, 0.35);
        color: #fff;
        opacity: 0;
        transform: translateY(-10px) scale(0.985);
        transition: opacity 200ms cubic-bezier(0.2, 0, 0.2, 1),
                    transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      #card.in { opacity: 1; transform: translateY(0) scale(1); }

      /* The badge holds both states and crossfades between them, so the card
         does not jump when the spinner becomes a tick. */
      #badge {
        position: relative;
        flex: 0 0 auto;
        width: 32px;
        height: 32px;
      }
      #badge > * {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 200ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      #spinner {
        box-sizing: border-box;
        border: 2.5px solid rgba(255, 255, 255, 0.14);
        border-top-color: var(--orange);
        animation: spin 720ms linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      #tick {
        background: linear-gradient(140deg, #fb923c, #ea580c);
        box-shadow: 0 2px 8px rgba(234, 88, 12, 0.45);
        opacity: 0;
        transform: scale(0.5);
      }
      #tick svg { width: 17px; height: 17px; }
      #tick path {
        stroke-dasharray: 26;
        stroke-dashoffset: 26;
      }

      /* Saved: the spinner goes, the tick pops in, and the stroke draws itself
         rather than appearing all at once. */
      #card.saved #spinner { opacity: 0; transform: scale(0.6); animation: none; }
      #card.saved #tick { opacity: 1; transform: scale(1); }
      #card.saved #tick path { animation: draw 260ms 90ms ease forwards; }
      @keyframes draw { to { stroke-dashoffset: 0; } }

      #text { min-width: 0; flex: 1; }
      #title {
        font-size: 13.5px;
        font-weight: 600;
        line-height: 1.25;
        letter-spacing: 0.005em;
      }
      #sub {
        margin-top: 3px;
        font-size: 11.5px;
        line-height: 1.3;
        color: rgba(255, 255, 255, 0.55);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Swapped rather than replaced, or the words change under a card that is
         otherwise standing still. */
      #text.swap #title, #text.swap #sub { animation: swap 280ms ease; }
      @keyframes swap {
        0% { opacity: 0; transform: translateY(4px); }
        100% { opacity: 1; transform: translateY(0); }
      }

      /* A hairline that drains while the finished card is up: it says how long
         is left without adding anything to read. */
      #bar {
        position: absolute;
        left: 15px;
        right: 15px;
        bottom: 0;
        height: 2px;
        border-radius: 2px;
        background: var(--orange);
        transform-origin: left center;
        transform: scaleX(0);
        opacity: 0;
      }
      #card.saved #bar {
        opacity: 0.5;
        animation: drain ${SHOW_MS}ms linear forwards;
      }
      @keyframes drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    </style>
  </head>
  <body>
    <div id="card">
      <div id="badge">
        <div id="spinner"></div>
        <div id="tick">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      </div>
      <div id="text">
        <div id="title"></div>
        <div id="sub"></div>
      </div>
      <div id="bar"></div>
    </div>
    <script>
      const card = document.getElementById('card');
      const text = document.getElementById('text');

      /*
       * Two sine notes, C6 then E6, each with an exponential tail.
       *
       * WebAudio rather than an <audio> element and a file: nothing to ship,
       * nothing to decode, and the envelope is what stops it clicking. A raw
       * gate on a sine pops at both ends; ramping the gain to near zero does
       * not.
       */
      function chime() {
        try {
          const ctx = new AudioContext();
          const now = ctx.currentTime;
          [[1046.5, 0], [1318.5, 0.085]].forEach(([hz, at]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = hz;
            gain.gain.setValueAtTime(0.0001, now + at);
            gain.gain.exponentialRampToValueAtTime(0.16, now + at + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.2);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + at);
            osc.stop(now + at + 0.22);
          });
          setTimeout(() => void ctx.close(), 600);
        } catch {
          // No audio device, or the page was not allowed to make one. The
          // card is still the point; the sound was the trimming.
        }
      }

      window.toast = (state, title, sub, withSound) => {
        const changing = document.getElementById('title').textContent !== '';
        document.getElementById('title').textContent = title;
        document.getElementById('sub').textContent = sub;

        // Only animate the words when they are replacing words, not when the
        // card is arriving with them.
        if (changing) {
          text.classList.remove('swap');
          void text.offsetWidth;
          text.classList.add('swap');
        }

        card.classList.toggle('saved', state === 'saved');
        card.classList.add('in');
        if (withSound) chime();
      };

      window.dismiss = () => {
        card.classList.remove('in');
        // Cleared so the next clip arrives with a fresh card rather than
        // animating out of the last one's words.
        setTimeout(() => {
          document.getElementById('title').textContent = '';
          document.getElementById('sub').textContent = '';
          card.classList.remove('saved');
        }, 240);
      };
    </script>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function build(): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH + BLEED * 2,
    height: HEIGHT + BLEED * 2,
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
    // Never takes focus. A window that alt-tabs somebody out of a firefight to
    // tell them their clip saved has done more harm than the clip was worth.
    focusable: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  // Above a maximised game, not merely above ordinary windows.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void win.loadURL(page());

  win.on('closed', () => {
    overlay = null;
  });

  return win;
}

function place(win: BrowserWindow, corner: Corner): void {
  // The display the pointer is on, which is the one being played on. A toast
  // about a game on the right hand monitor is no use on the left hand one.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const width = WIDTH + BLEED * 2;
  const height = HEIGHT + BLEED * 2;
  // The bleed is empty pixels, so the visible card keeps the margin rather
  // than the window it sits in.
  const edge = MARGIN - BLEED;

  const x = corner.endsWith('left') ? area.x + edge : area.x + area.width - width - edge;
  const y = corner.startsWith('top') ? area.y + edge : area.y + area.height - height - edge;

  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

/**
 * Build the window and load the page now, so the first clip does not pay for it.
 *
 * Constructing a `BrowserWindow` and loading a page is most of a second, and it
 * was landing squarely between the key going down and the card appearing, which
 * is the one moment in this feature where latency is the whole product. Doing it
 * at boot costs one hidden 368x134 window in a process that is already resident
 * in the tray all day.
 *
 * Safe to call more than once, and cheap when the window already exists.
 */
export function warmClipToast(): void {
  if (loadSettings().clipToast === false) return;
  if (overlay && !overlay.isDestroyed()) return;
  overlay = build();
}

async function render(
  state: 'saving' | 'saved',
  title: string,
  subtitle: string,
  sound = false,
): Promise<void> {
  const began = Date.now();
  const settings = loadSettings();
  if (settings.clipToast === false) return;

  if (!overlay || overlay.isDestroyed()) overlay = build();
  const win = overlay;

  // A second clip while a card is up restarts it rather than stacking, which
  // is what pressing the key twice means.
  if (hideTimer) clearTimeout(hideTimer);

  if (win.webContents.isLoading()) {
    await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()));
  }

  // Only move the window while it is hidden: repositioning a visible card
  // makes it jump across the screen mid-sequence.
  if (!win.isVisible()) {
    place(win, (settings.clipToastCorner as Corner) ?? 'top-right');
    win.showInactive();
  }

  await win.webContents.executeJavaScript(
    `window.toast(${JSON.stringify(state)}, ${JSON.stringify(title)}, ${JSON.stringify(subtitle)}, ${sound});`,
  );

  // The one number worth watching in this file. Everything above is arranged
  // around it, so it says out loud whether the arrangement is working.
  console.log(`[toast] ${state} in ${Date.now() - began}ms`);

  const linger = state === 'saved' ? SHOW_MS : SAVING_TIMEOUT_MS;
  hideTimer = setTimeout(() => {
    void (async () => {
      try {
        await win.webContents.executeJavaScript('window.dismiss();');
        // Long enough for the fade to finish; hiding mid-transition leaves the
        // next card starting from a half faded one.
        setTimeout(() => {
          if (!win.isDestroyed()) win.hide();
        }, 260);
      } catch {
        if (!win.isDestroyed()) win.hide();
      }
    })();
  }, linger);
}

/** A replay has landed in staging and is being filed. No game yet, on purpose. */
export async function showClipSaving(): Promise<void> {
  try {
    await render('saving', 'Saving your clip', 'Filing it into your library');
  } catch (error) {
    console.error('[toast]', error instanceof Error ? error.message : error);
  }
}

/** The clip is indexed and openable. This is the one that chimes. */
export async function showClipSaved(subtitle: string): Promise<void> {
  try {
    const settings = loadSettings();
    await render('saved', 'Clip saved', subtitle, settings.clipToastSound !== false);
  } catch (error) {
    console.error('[toast]', error instanceof Error ? error.message : error);
  }
}

/**
 * The whole sequence, from Settings, so the corner, the wait and the chime can
 * be judged rather than guessed at.
 */
export async function previewClipToast(): Promise<void> {
  await showClipSaving();
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await showClipSaved('Battlefield 6 · 0:30');
}

export function closeClipToast(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = null;
}
