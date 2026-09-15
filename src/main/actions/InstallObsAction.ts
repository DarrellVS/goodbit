import { BaseAction } from './BaseAction.js';
import { announce } from '../startup.js';
import {
  downloadAndRunInstaller,
  hasWinget,
  installOptions,
  installWithWinget,
  latestInstaller,
  wingetWorthRetrying,
  OBS_DOWNLOAD_PAGE,
  type ObsInstallOption,
} from '../services/obs/install.js';
import { obsIsInstalled } from '../services/obs/paths.js';
import { suppressFirstRunWizard } from '../services/obs/setup.js';
import {
  findPython,
  installPrivatePython,
  ownPython,
  privatePythonDir,
} from '../services/obs/python.js';

/**
 * Getting OBS onto a machine that has never had it.
 *
 * This is the step the whole first run turns on. GoodBit without OBS is a
 * folder picker pointed at an empty folder, and "go and install OBS, then come
 * back" is where most people put the app down.
 *
 * Neither route installs anything silently. winget prints what it is doing and
 * installs Microsoft's own package for OBS; the download route opens OBS's own
 * installer, which asks its own questions.
 */

export interface ObsInstallPlan {
  alreadyInstalled: boolean;
  options: ObsInstallOption[];
  /** What the download route would fetch, so the dialog can name it. */
  installer: { version: string; name: string; bytes: number } | null;
  downloadPage: string;
}

export class PlanObsInstallAction extends BaseAction<void, ObsInstallPlan> {
  async execute(): Promise<ObsInstallPlan> {
    const options = await installOptions();

    let installer: ObsInstallPlan['installer'] = null;
    try {
      const asset = await latestInstaller();
      installer = { version: asset.version, name: asset.name, bytes: asset.bytes };
    } catch {
      // Offline, or GitHub is having a day. The manual route still works, and
      // the dialog says so rather than pretending the feature is broken.
    }

    return {
      alreadyInstalled: await obsIsInstalled(),
      options,
      installer,
      downloadPage: OBS_DOWNLOAD_PAGE,
    };
  }
}

export interface InstallObsInput {
  /** `winget` when it is there, otherwise the installer download. */
  method?: 'winget' | 'download';
}

export interface InstallObsResult {
  method: 'winget' | 'download';
  /** True when OBS is on the machine by the time this returns. */
  installed: boolean;
  message: string;
}

export class InstallObsAction extends BaseAction<InstallObsInput, InstallObsResult> {
  async execute(input: InstallObsInput): Promise<InstallObsResult> {
    const method = input.method ?? ((await hasWinget()) ? 'winget' : 'download');

    const report = (
      stage: 'downloading' | 'running' | 'done' | 'failed',
      message: string,
      percent?: number,
    ): void => announce({ type: 'obs-setup-progress', stage, message, percent });

    try {
      if (method === 'winget') {
        report('running', 'Asking Windows to install OBS');

        try {
          await installWithWinget((progress) => {
            if (progress.stage === 'running') report('running', progress.message);
            if (progress.stage === 'done') report('done', progress.message);
          });

          const installed = await obsIsInstalled();
          if (installed) suppressFirstRunWizard();

          return {
            method,
            installed,
            message: 'OBS is installed.',
          };
        } catch (cause) {
          /*
           * Some of winget's refusals are about winget, not about OBS.
           *
           * A leftover uninstall entry makes it treat an install as an upgrade
           * and refuse for having nothing newer; a file held open by a browser
           * stops it replacing one. OBS's own installer handles both, asks for
           * elevation itself, and is the button next to this one, so take it
           * rather than handing back a hex code.
           */
          const message = cause instanceof Error ? cause.message : String(cause);
          if (!wingetWorthRetrying(message)) throw cause;

          report('running', `${message} Using the official installer instead.`);
          const before = await obsIsInstalled();
      await downloadAndRunInstaller((progress) => {
            if (progress.stage === 'downloading') {
              report(
                'downloading',
                `Downloading OBS, ${Math.round(progress.bytes / 1_000_000)} of ${Math.round(
                  progress.totalBytes / 1_000_000,
                )} MB`,
                progress.percent,
              );
            }
            if (progress.stage === 'running') report('running', progress.message);
            if (progress.stage === 'done') report('done', progress.message);
          });

          return {
            method: 'download',
            installed: false,
            message: `${message} The OBS installer is open instead: click through it, then come back here.`,
          };
        }
      }

      await downloadAndRunInstaller((progress) => {
        if (progress.stage === 'downloading') {
          report(
            'downloading',
            `Downloading OBS, ${Math.round(progress.bytes / 1_000_000)} of ${Math.round(
              progress.totalBytes / 1_000_000,
            )} MB`,
            progress.percent,
          );
        }
        if (progress.stage === 'running') report('running', progress.message);
        if (progress.stage === 'done') report('done', progress.message);
      });

      const now = await obsIsInstalled();
      // Before OBS has ever started, so its wizard never opens.
      if (now) suppressFirstRunWizard();

      return {
        method,
        installed: now,
        message: now
          ? 'OBS is installed.'
          : 'The OBS installer is open. Click through it, then come back here.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report('failed', message);
      throw error;
    }
  }
}

export interface PythonState {
  /**
   * What is on the machine, best first, including versions OBS cannot load.
   *
   * Reported so the interface can explain a situation, never depended on.
   * GoodBit uses its own copy.
   */
  installs: Array<{
    version: string;
    directory: string;
    usable: boolean;
    tooNew: boolean;
    hasTkinter: boolean;
    private: boolean;
  }>;
  /** GoodBit's own is installed and runs. */
  ready: boolean;
  /** Where GoodBit's own lives, or would. */
  directory: string;
  /** The version GoodBit installs. */
  offered: string;
}

export class CheckPythonAction extends BaseAction<void, PythonState> {
  async execute(): Promise<PythonState> {
    const [installs, own] = await Promise.all([findPython(), ownPython()]);

    return {
      installs: installs.map((install) => ({
        version: install.version,
        directory: install.directory,
        usable: install.usable,
        tooNew: install.tooNew,
        hasTkinter: install.hasTkinter,
        private: install.private,
      })),
      // Only GoodBit's own counts. A usable system Python is somebody else's
      // to upgrade or remove, and when they do, clips stop being sorted with
      // no visible cause.
      ready: own?.usable === true,
      directory: privatePythonDir(),
      offered: '3.11.9',
    };
  }
}

/**
 * Install a Python that belongs to GoodBit.
 *
 * The alternative was telling someone to go and install a language runtime,
 * with the tcl/tk box ticked, at a version OBS happens to accept, which is
 * three things to get right before a clip lands in the right folder. This puts
 * one in `%APPDATA%/GoodBit/python`: per-user, off the PATH, not associated
 * with anything, and used for exactly one script.
 */
export class InstallPythonAction extends BaseAction<void, { version: string; directory: string }> {
  async execute(): Promise<{ version: string; directory: string }> {
    const report = (
      stage: 'downloading' | 'running' | 'done' | 'failed',
      message: string,
      percent?: number,
    ): void => announce({ type: 'obs-setup-progress', stage, message, percent });

    try {
      const installed = await installPrivatePython((progress) => {
        if (progress.stage === 'downloading') {
          report('downloading', `Downloading Python ${progress.percent}%`, progress.percent);
        }
        if (progress.stage === 'verifying') report('running', 'Checking the signature');
        if (progress.stage === 'installing') report('running', 'Installing Python for GoodBit');
        if (progress.stage === 'done') report('done', 'Python installed');
      });

      return { version: installed.version, directory: installed.directory };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report('failed', message);
      throw error;
    }
  }
}
