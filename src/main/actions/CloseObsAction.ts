/**
 * Asking OBS to close, rather than ending it.
 *
 * `taskkill` is not an option here and the reason is the same one the whole
 * OBS module is built around: OBS holds its entire configuration in memory and
 * writes it out on exit. Killing it loses whatever it had not written, and if
 * the replay buffer is running it also throws away the last thirty seconds
 * sitting in RAM. So this sends the window a close request, exactly as
 * clicking the X does, and then waits.
 *
 * It can legitimately fail: OBS asks for confirmation before exiting while an
 * output is active, and that dialog is the user's to answer. A refusal here is
 * an honest "it is still open", never a forced exit.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BaseAction } from './BaseAction.js';
import { obsIsRunning } from '../services/obs/paths.js';

const run = promisify(execFile);

export interface CloseObsOutput {
  closed: boolean;
  /** True when it was not running to begin with, so the caller can stay quiet. */
  wasClosed: boolean;
  /** Why it is still open, in words a user can act on. */
  reason?: 'no-window' | 'refused';
  /** True when it had to be ended rather than asked. */
  ended?: boolean;
}

/** Long enough for OBS to stop an output and write its config, short enough to report back. */
const WAIT_MS = 20_000;
const POLL_MS = 500;

export interface CloseObsInput {
  /**
   * End the process when there is no window to ask.
   *
   * Off by default, because ending OBS loses whatever it had not written and
   * the user should be the one to decide that. On when the caller has already
   * told them there is nothing to ask.
   */
  force?: boolean;
}

export class CloseObsAction extends BaseAction<CloseObsInput | void, CloseObsOutput> {
  async execute(input?: CloseObsInput): Promise<CloseObsOutput> {
    if (!(await obsIsRunning())) return { closed: true, wasClosed: true };

    /*
     * There may be no window to close, and that is the common case here.
     *
     * OBS with `[BasicWindow] SysTrayEnabled=true`, which is the default, does
     * not quit when its X is clicked: it hides to the tray and keeps running,
     * buffer and all. So a user who believes they closed OBS still has it
     * open, with `MainWindowHandle` at zero, and `CloseMainWindow` has nothing
     * to send WM_CLOSE to. Sending it anyway and then waiting twenty seconds
     * to report failure is the worst of both.
     *
     * So ask first, and say which of the two situations this is.
     */
    let asked = false;
    try {
      const { stdout } = await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          'Get-Process obs64 -ErrorAction SilentlyContinue | ForEach-Object { ' +
            'if ($_.MainWindowHandle -ne 0) { $_.CloseMainWindow() | Out-Null; "asked" } else { "hidden" } }',
        ],
        { windowsHide: true, timeout: 15_000 },
      );
      asked = stdout.includes('asked');
    } catch {
      // Nothing to close, or no permission to ask. The poll below decides.
    }

    /*
     * No window to ask, which is a real state and not a rare one.
     *
     * An OBS whose interface has gone but whose process is still alive holds
     * the replay buffer and the config lock with nothing to click. WM_CLOSE
     * has no target, the tray has no icon, and the user has already "closed"
     * it as far as they can tell. Ending it is then the only move, and it is
     * safe in the way that matters here: an OBS with no window has no unsaved
     * interface state, and GoodBit is about to write its config anyway, which
     * a normal exit would have overwritten from memory.
     */
    if (!asked) {
      if (!input?.force) return { closed: false, wasClosed: false, reason: 'no-window' };

      try {
        await run('taskkill', ['/F', '/IM', 'obs64.exe'], { windowsHide: true, timeout: 10_000 });
      } catch {
        // Already gone, or not ours to end.
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const gone = !(await obsIsRunning());
      return { closed: gone, wasClosed: false, ended: gone, reason: gone ? undefined : 'refused' };
    }

    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (!(await obsIsRunning())) return { closed: true, wasClosed: false };
    }

    // It had a window, it was asked, and it is still here: OBS is showing its
    // own "are you sure" over a running output.
    return { closed: false, wasClosed: false, reason: 'refused' };
  }
}
