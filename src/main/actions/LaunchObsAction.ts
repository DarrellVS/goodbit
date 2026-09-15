import { spawn } from 'node:child_process';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { findObsExecutable, obsIsRunning } from '../services/obs/paths.js';
import { GOODBIT_COLLECTION, GOODBIT_PROFILE, readManifest } from '../services/obs/setup.js';

/**
 * Starting OBS, which GoodBit is in a good position to do.
 *
 * The app is already a background service: registered at login, alive in the
 * tray, watching the folder whether or not a window is open. Starting the
 * program that fills that folder is the same kind of job, and it saves the one
 * step nobody remembers, which is starting the replay buffer.
 *
 * The profile and collection are named on the command line rather than written
 * into OBS's config. Switching someone's active profile behind their back is
 * exactly the kind of change this feature refuses to make, and a launch flag
 * asks for the same result without editing anything.
 */

export interface LaunchObsInput {
  /** Off for someone who wants OBS up but not recording yet. */
  startReplayBuffer?: boolean;
  minimized?: boolean;
  /** Defaults to GoodBit's own, when the setup created them. */
  profile?: string;
  collection?: string;
}

export interface LaunchObsResult {
  launched: boolean;
  alreadyRunning: boolean;
  executable: string | null;
  args: string[];
}

export class LaunchObsAction extends BaseAction<LaunchObsInput, LaunchObsResult> {
  async execute(input: LaunchObsInput): Promise<LaunchObsResult> {
    const executable = await findObsExecutable();
    if (!executable) {
      throw new Error('OBS could not be found on this machine.');
    }

    if (await obsIsRunning()) {
      return { launched: false, alreadyRunning: true, executable, args: [] };
    }

    const manifest = readManifest();
    const profile = input.profile ?? (manifest?.profile ? GOODBIT_PROFILE : undefined);
    const collection = input.collection ?? (manifest?.collection ? GOODBIT_COLLECTION : undefined);

    const args: string[] = [];
    if (profile) args.push('--profile', profile);
    if (collection) args.push('--collection', collection);
    if (input.startReplayBuffer !== false) args.push('--startreplaybuffer');
    if (input.minimized) args.push('--minimize-to-tray');

    /*
     * Started from its own directory, and detached.
     *
     * OBS resolves its locale files and plugins relative to the working
     * directory, and launching it from GoodBit's install folder gives an OBS
     * with no translations and, on some installs, no plugins at all. Detached
     * so that closing GoodBit does not take OBS with it: the recorder is not a
     * child process of the library.
     */
    const child = spawn(executable, args, {
      cwd: path.dirname(executable),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();

    return { launched: true, alreadyRunning: false, executable, args };
  }
}
