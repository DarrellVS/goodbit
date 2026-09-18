import { app } from 'electron';
import { announce } from '../startup.js';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { obsIsInstalled, obsIsRunning } from '../services/obs/paths.js';
import { readObs } from '../services/obs/config.js';
import { chooseEncoder } from '../services/obs/encoderChoice.js';
import { audioDevices, type AudioDevice } from '../services/obs/audioDevices.js';
import { captureDisplays, defaultCaptureDisplay, type CaptureDisplay } from '../services/obs/displays.js';
import { installedSteamGames, type SteamGame } from '../services/obs/steam.js';
import { planAudioTracks } from '../services/obs/audioTracks.js';
import {
  applyObsSetup,
  planObsSetup,
  type ObsSetupChoices,
  type ObsSetupPlan,
} from '../services/obs/setup.js';
import { loadSettings, saveSettings } from '../settings.js';

/* The shape is agreed in `src/shared`; re-exported so callers here are unchanged. */
import type { ObsSetupPlanResponse, ObsSetupRequest, ObsSetupResult } from '@shared/index.js';
export type { ObsSetupRequest, ObsSetupResult };

/**
 * Turning a set of choices into a plan, and a plan into files.
 *
 * Split in two because the preview and the apply have to be the same thing:
 * a dialog that shows one list of changes and then writes a different one is
 * worse than no dialog at all.
 */

async function resolveChoices(request: ObsSetupRequest): Promise<ObsSetupChoices> {
  const settings = loadSettings();

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
    display,
    captureDesktop: request.captureDesktop !== false,
    encoder,
    audio,
    /*
     * On unless it is refused.
     *
     * The same default as every other step here, and for a stronger reason
     * than most: this one is the only choice the setup makes that a person
     * cannot revisit later. A profile pointed at the wrong folder can be
     * pointed at the right one tonight, and every clip already recorded is
     * fine. Sound mixed down to one track at record time is mixed for ever.
     */
    multiTrackAudio: request.multiTrackAudio !== false,
  };
}

export class PlanObsSetupAction extends BaseAction<ObsSetupRequest, ObsSetupPlanResponse> {
  async execute(request: ObsSetupRequest): Promise<ObsSetupPlanResponse> {
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

export class ApplyObsSetupAction extends BaseAction<ObsSetupRequest, ObsSetupResult> {
  async execute(request: ObsSetupRequest): Promise<ObsSetupResult> {
    if (await obsIsRunning()) {
      throw new Error('OBS is open. Close it first, or it will overwrite everything written here.');
    }

    const choices = await resolveChoices(request);
    const plan = planObsSetup(choices, undefined, await obsIsInstalled());
    if (plan.blockers.length) throw new Error(plan.blockers[0]);

    const summary: string[] = [];

    announce({ type: 'obs-setup-progress', stage: 'running', message: 'Writing the OBS settings' });
    const manifest = applyObsSetup(choices, { version: app.getVersion() });
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
    const audioPlan = planAudioTracks(choices.audio, choices.multiTrackAudio);
    if (audioPlan.multiTrack) {
      summary.push(
        `Each sound source records onto its own track: ${audioPlan.tracks
          .filter((track) => !track.master)
          .map((track) => `${track.track} is ${track.label.toLowerCase()}`)
          .join(', ')}, with track 1 holding the lot`,
      );
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
