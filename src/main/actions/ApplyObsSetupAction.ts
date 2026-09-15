import { app } from 'electron';
import { announce } from '../startup.js';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { obsIsInstalled, obsIsRunning } from '../services/obs/paths.js';
import { ensureOwnPython, ownPython, privatePythonDir } from '../services/obs/python.js';
import { readObs } from '../services/obs/config.js';
import { chooseEncoder } from '../services/obs/encoderChoice.js';
import { audioDevices, type AudioDevice } from '../services/obs/audioDevices.js';
import { captureDisplays, defaultCaptureDisplay, type CaptureDisplay } from '../services/obs/displays.js';
import {
  ClipNamingMode,
  alias,
  downloadSmartReplays,
  installedSmartReplays,
  type SmartReplaysAlias,
} from '../services/obs/smartReplays.js';
import { installedSteamGames, type SteamGame } from '../services/obs/steam.js';
import {
  applyObsSetup,
  planObsSetup,
  type ObsSetupChoices,
  type ObsSetupPlan,
} from '../services/obs/setup.js';
import { loadSettings, saveSettings } from '../settings.js';

/**
 * Turning a set of choices into a plan, and a plan into files.
 *
 * Split in two because the preview and the apply have to be the same thing:
 * a dialog that shows one list of changes and then writes a different one is
 * worse than no dialog at all.
 */

export interface ObsSetupRequest {
  createProfile?: boolean;
  /** Electron's display id. Defaults to the primary screen. */
  displayId?: number;
  /** OBS device ids. Absent means the system's own output, alone. */
  audioDeviceIds?: string[];
  captureDesktop?: boolean;
  enableReplayBuffer?: boolean;
  replayBufferSeconds?: number;
  bindHotkey?: boolean;
  hotkey?: string;
  createScene?: boolean;
  installScript?: boolean;
  namingMode?: ClipNamingMode;
  setPythonPath?: boolean;
}

/**
 * A name that will not start a second folder for a game you already have.
 *
 * Steam stores the marketing name, trademark symbols and all, so it offers
 * `Battlefield™ 6` for a library whose folder has been `Battlefield 6`
 * since August. Writing the Steam name would leave the next clip in a new
 * folder beside the old one, and the library would show the same game twice.
 * So the symbols come off, and a folder that already exists wins outright.
 */
export function aliasName(steamName: string, existingFolders: string[]): string {
  const cleaned = steamName
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const flatten = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const existing = existingFolders.find((folder) => flatten(folder) === flatten(cleaned));
  return existing ?? cleaned;
}

/**
 * Aliases for the games on this machine, ready before the first clip.
 *
 * Pointed at the install folder rather than an executable, because the script
 * walks a running process's parent directories looking for a match. That is
 * worth knowing: it means GoodBit never has to work out which of the nine
 * executables in a game folder is the game, and the alias survives a patch
 * that renames one.
 */
export async function knownAliases(videosRoot: string): Promise<SmartReplaysAlias[]> {
  let games: SteamGame[] = [];
  try {
    games = await installedSteamGames();
  } catch {
    // No Steam, or a machine that will not answer. Aliases are a convenience.
  }

  const folders = videosRoot ? libraryFolders(videosRoot) : [];
  // A name the script rejects takes the whole list down with it, so anything
  // that cannot be made safe is dropped rather than written.
  return games
    .map((game) => alias(game.folder, aliasName(game.name, folders)))
    .filter((entry): entry is SmartReplaysAlias => entry !== null);
}

/** Folders in the library, for the UI to show what it would be naming. */
export function libraryFolders(videosRoot: string): string[] {
  try {
    return readdirSync(videosRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function resolveChoices(request: ObsSetupRequest): Promise<ObsSetupChoices> {
  const settings = loadSettings();

  /*
   * Python: GoodBit's own, every time.
   *
   * Not whatever the machine has. That was tried, and it pointed OBS at a 3.13
   * which OBS refuses to load, silently, with the only evidence in an OBS log
   * file. A system Python is also somebody else's to upgrade or remove, and
   * when they do, clips quietly stop being sorted.
   *
   * The install itself happens at apply time, so nothing is downloaded for
   * somebody who is only looking at the plan.
   */
  const obs = readObs();
  const installed = await ownPython();

  // The screen decides the canvas size and which display the scene captures,
  // so it is resolved once here rather than guessed in two places.
  const displays = await captureDisplays();
  const display =
    displays.find((candidate) => candidate.id === request.displayId) ??
    (await defaultCaptureDisplay());

  // Asked with the display's colour state, because the answer decides whether
  // that colour is achievable: 10 bit needs HEVC or AV1.
  const encoder = await chooseEncoder(display?.hdrEnabled === true);

  const devices = await audioDevices();
  const audio: AudioDevice[] = request.audioDeviceIds
    ? (request.audioDeviceIds
        .map((id) => devices.find((device) => device.id === id))
        .filter(Boolean) as AudioDevice[])
    : devices.filter((device) => device.isDefault);

  return {
    videosRoot: settings.videosRoot,
    createProfile: request.createProfile !== false,
    enableReplayBuffer: request.enableReplayBuffer !== false,
    replayBufferSeconds: request.replayBufferSeconds ?? 30,
    bindHotkey: request.bindHotkey !== false,
    hotkey: request.hotkey ?? 'OBS_KEY_F8',
    createScene: request.createScene !== false,
    installScript: request.installScript !== false,
    aliases: await knownAliases(settings.videosRoot),
    namingMode: request.namingMode ?? ClipNamingMode.CurrentProcess,
    // Always written, because the point is that OBS uses this one.
    setPythonPath: request.setPythonPath !== false,
    // The folder is known before the install happens, so the plan can name it.
    pythonDirectory: installed?.directory ?? privatePythonDir(),
    pythonInstalled: Boolean(installed?.usable),
    display,
    captureDesktop: request.captureDesktop !== false,
    encoder,
    audio,
  };
}

export class PlanObsSetupAction extends BaseAction<ObsSetupRequest, ObsSetupPlan & { obsRunning: boolean }> {
  async execute(request: ObsSetupRequest): Promise<ObsSetupPlan & { obsRunning: boolean }> {
    const choices = await resolveChoices(request);
    const [installed, obsRunning] = await Promise.all([obsIsInstalled(), obsIsRunning()]);
    const plan = planObsSetup(choices, undefined, installed);

    if (obsRunning) {
      plan.blockers.unshift(
        'OBS is open. It rewrites its settings file from memory when it closes, so anything written now would be thrown away. Close it and try again.',
      );
    }

    return { ...plan, obsRunning };
  }
}

export interface ObsSetupResult {
  applied: boolean;
  /** What was written, so the UI can say it rather than guess. */
  summary: string[];
  scriptPath: string | null;
  profile: string | null;
  collection: string | null;
}

export class ApplyObsSetupAction extends BaseAction<ObsSetupRequest, ObsSetupResult> {
  async execute(request: ObsSetupRequest): Promise<ObsSetupResult> {
    if (await obsIsRunning()) {
      throw new Error('OBS is open. Close it first, or it will overwrite everything written here.');
    }

    const choices = await resolveChoices(request);
    const plan = planObsSetup(choices, undefined, await obsIsInstalled());
    if (plan.blockers.length) throw new Error(plan.blockers[0]);

    const summary: string[] = [];
    let scriptBlobSha1: string | undefined;

    if (choices.installScript) {
      /*
       * The Python first, because the script is useless without it and this is
       * the step that can take a minute.
       */
      if (!choices.pythonInstalled) {
        announce({
          type: 'obs-setup-progress',
          stage: 'running',
          message: 'Installing Python for GoodBit',
        });
        const python = await ensureOwnPython((progress) => {
          if (progress.stage === 'downloading') {
            announce({
              type: 'obs-setup-progress',
              stage: 'downloading',
              percent: progress.percent,
              message: `Downloading Python ${progress.percent}%`,
            });
          }
          if (progress.stage === 'installing') {
            announce({
              type: 'obs-setup-progress',
              stage: 'running',
              message: 'Installing Python for GoodBit',
            });
          }
        });
        summary.push(`Installed Python ${python.version}, GoodBit's own copy`);
      }

      const existing = installedSmartReplays();
      if (existing?.matchesPin) {
        scriptBlobSha1 = existing.blobSha1;
        summary.push('Smart Replays was already installed and up to date');
      } else {
        announce({
          type: 'obs-setup-progress',
          stage: 'running',
          message: 'Downloading Smart Replays',
        });
        const downloaded = await downloadSmartReplays();
        scriptBlobSha1 = downloaded.blobSha1;
        summary.push(`Downloaded Smart Replays, ${Math.round(downloaded.bytes / 1024)} KB, verified`);
      }
    }

    announce({ type: 'obs-setup-progress', stage: 'running', message: 'Writing the OBS settings' });
    const manifest = applyObsSetup(choices, { version: app.getVersion(), scriptBlobSha1 });
    announce({ type: 'obs-setup-progress', stage: 'done', message: 'Done' });

    if (choices.createProfile) summary.push('Created the GoodBit profile');
    if (choices.enableReplayBuffer) {
      summary.push(`Replay buffer on, ${choices.replayBufferSeconds} seconds`);
    }
    if (choices.bindHotkey) {
      summary.push(`Save Replay bound to ${choices.hotkey.replace('OBS_KEY_', '')}`);
    }
    if (choices.display) {
      summary.push(
        `Recording ${choices.display.width}x${choices.display.height} at ${
          choices.display.frequency >= 60 ? 60 : choices.display.frequency
        }, matching ${choices.display.label}`,
      );
    }
    if (choices.createScene) {
      summary.push(
        choices.captureDesktop && choices.display?.monitorId
          ? 'Created the GoodBit scene: the game on top, your screen underneath'
          : 'Created the GoodBit scene, capturing anything fullscreen',
      );
    }
    if (choices.setPythonPath && choices.pythonDirectory) {
      summary.push(`Pointed OBS at Python in ${path.basename(choices.pythonDirectory)}`);
    }

    /*
     * From now on, OBS comes up with GoodBit.
     *
     * Only once there is a profile to start it with, which is here. Settings,
     * Recording turns it off for anyone who would rather not.
     */
    if (choices.createProfile && loadSettings().startObsWithGoodbit !== false) {
      saveSettings({ startObsWithGoodbit: true });
      summary.push('OBS will start with GoodBit from now on, minimised, with the buffer running');
    }

    return {
      applied: true,
      summary,
      scriptPath: manifest.script?.path ?? null,
      profile: manifest.profile,
      collection: manifest.collection,
    };
  }
}

/** The screens, for the dialog to offer. */
export class ListCaptureDisplaysAction extends BaseAction<void, CaptureDisplay[]> {
  async execute(): Promise<CaptureDisplay[]> {
    return captureDisplays();
  }
}

/** The audio devices, for the wizard to offer. */
export class ListAudioDevicesAction extends BaseAction<void, AudioDevice[]> {
  async execute(): Promise<AudioDevice[]> {
    return audioDevices();
  }
}
