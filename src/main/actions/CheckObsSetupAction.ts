import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { readObs, type ObsProfile, type ObsSceneCollection } from '../services/obs/config.js';
import { findObsExecutable, obsIsInstalled, obsIsRunning } from '../services/obs/paths.js';
import { GOODBIT_COLLECTION, GOODBIT_PROFILE, readManifest } from '../services/obs/setup.js';
import { loadSettings } from '../settings.js';
import { INCOMING_DIR_NAME } from '../services/capture/incoming.js';

/* The shape is agreed in `src/shared`; re-exported so callers here are unchanged. */
import type { FindingLevel, ObsFinding, ObsStatus } from '@shared/index.js';
export type { FindingLevel, ObsFinding, ObsStatus };

/**
 * What is wrong with this machine's OBS, in sentences.
 *
 * Read only, on purpose, and useful entirely on its own. Most people whose
 * clips are not appearing have exactly one setting wrong and no way to know
 * which, and naming it is worth more than fixing it silently would be.
 */

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

export class CheckObsSetupAction extends BaseAction<void, ObsStatus> {
  async execute(): Promise<ObsStatus> {
    const obs = readObs();
    const settings = loadSettings();
    const videosRoot = settings.videosRoot;
    const findings: ObsFinding[] = [];

    const [running, executable, installed] = await Promise.all([
      obsIsRunning(),
      findObsExecutable(),
      obsIsInstalled(),
    ]);

    if (!installed) {
      findings.push({
        id: 'obs-missing',
        level: 'blocker',
        title: 'OBS is not installed',
        detail:
          'GoodBit is a companion to OBS: OBS records, GoodBit keeps what you record. Nothing appears in the library until OBS is on this machine.',
        fixable: true,
      });
    }

    // The GoodBit profile if the setup made one, otherwise whatever OBS is
    // pointed at. See `judging` above.
    const managedProfile = obs.profiles.find((candidate) => candidate.folder === GOODBIT_PROFILE);
    const managedCollection = obs.collections.find(
      (candidate) => candidate.file === GOODBIT_COLLECTION,
    );

    const profile: ObsProfile | null = managedProfile ?? obs.activeProfile;
    const collection: ObsSceneCollection | null = managedCollection ?? obs.activeCollection;
    const judging: 'goodbit' | 'active' = managedProfile ? 'goodbit' : 'active';

    /*
     * Anything that captures: a game, a window, a display, a camera, an image.
     * A collection of nothing but empty scenes is OBS's own starting point.
     */
    const hasScenes = obs.collections.some((collection) =>
      collection.sourceKinds.some((kind) => kind !== 'scene' && kind !== 'group'),
    );

    const collectionScript = collection?.scriptEntry ?? null;

    if (installed && !profile) {
      // A blocker, not a warning. With no profile to read there is no way to
      // say whether the buffer is on or a key is bound, and answering "ready"
      // because no test failed is how a library sits empty with a clean bill
      // of health on the settings screen.
      findings.push({
        id: 'profile-unreadable',
        level: 'blocker',
        title: 'OBS has no profile GoodBit can read',
        detail:
          'Its settings file is missing or unreadable, so none of the recording settings could be checked. Opening OBS once writes it.',
        fixable: true,
      });
    }

    if (profile) {
      if (!profile.replayBufferEnabled) {
        findings.push({
          id: 'buffer-off',
          level: 'blocker',
          title: 'The replay buffer is off',
          detail: `Profile "${profile.name}" is not buffering, so there is nothing to save when you press the key.`,
          fixable: true,
        });
      }

      if (!profile.saveReplayKey) {
        findings.push({
          id: 'hotkey-missing',
          level: 'blocker',
          title: 'No key saves a replay',
          detail: 'Save Replay has no shortcut bound in this profile.',
          fixable: true,
        });
      }

      /*
       * Two paths are right, and one of them is only right for now.
       *
       * GoodBit points OBS at its own staging folder and files each clip into
       * a game folder itself. Recording straight into the videos root still
       * produces clips that get indexed, so it is worth saying rather than
       * treating as a failure.
       */
      const staging = videosRoot ? path.join(videosRoot, INCOMING_DIR_NAME) : '';
      const recordsSomewhereKnown =
        !profile.recordingPath ||
        !videosRoot ||
        samePath(profile.recordingPath, staging) ||
        samePath(profile.recordingPath, videosRoot);

      if (!recordsSomewhereKnown) {
        findings.push({
          id: 'path-mismatch',
          level: 'blocker',
          title: 'OBS and GoodBit are looking at different folders',
          detail: `OBS records into ${profile.recordingPath}, GoodBit watches ${videosRoot}.`,
          fixable: true,
        });
      }

      // HDR: detection and a sentence, never a setting. A colour space written
      // once goes stale the moment the user toggles HDR in Windows, and an SDR
      // recording of an HDR display has already clipped its highlights by the
      // time anything downstream sees it.
      if (profile.colorSpace === '2100PQ' || profile.colorSpace === '2100HLG') {
        findings.push({
          id: 'hdr-on',
          level: 'ok',
          title: 'OBS is recording in HDR',
          detail:
            'GoodBit tone maps every frame it decodes, so exports and thumbnails come out looking like the game did.',
          fixable: false,
        });
      }
    }

    /*
     * A scene collection left holding a script is worth saying, and only that.
     *
     * Naming a clip is GoodBit's own job: `services/capture/` reads which
     * program was in front while the replay was recording and files it. A
     * leftover script doing the same thing is a race, and it usually wins, so
     * setting up again takes it out.
     */
    if (collectionScript) {
      findings.push({
        id: 'script-present',
        level: 'warning',
        title: 'A script in OBS is still sorting your clips',
        detail:
          'GoodBit files clips into a folder per game itself, and two things moving the same file is a race. Setting up again removes it.',
        fixable: true,
      });
    }

    if (!videosRoot) {
      findings.push({
        id: 'no-library',
        level: 'blocker',
        title: 'GoodBit has no clips folder yet',
        detail: 'Pick one and the setup can point OBS at the same place.',
        fixable: false,
      });
    }

    if (judging === 'goodbit' && obs.activeProfile && obs.activeProfile.folder !== GOODBIT_PROFILE) {
      findings.push({
        id: 'profile-not-active',
        level: 'ok',
        title: `OBS opens on "${obs.activeProfile.name}", GoodBit starts it on its own`,
        detail:
          'Your active profile is left exactly as it is. Starting OBS from here names the GoodBit profile on the command line instead of changing what OBS opens with.',
        fixable: false,
      });
    }

    const blocking = findings.filter((finding) => finding.level === 'blocker');

    return {
      installed,
      running,
      executable,
      ready: installed && blocking.length === 0,
      findings,
      activeProfileName: obs.activeProfile?.name ?? null,
      goodbitProfileExists: Boolean(managedProfile),
      hasScenes,
      judging,
      videosRoot,
      recordingPath: profile?.recordingPath ?? null,
      replayBufferSeconds: profile?.replayBufferSeconds ?? null,
      hotkey: profile?.saveReplayKey ?? null,
      audioDeviceIds:
        obs.collections.find((collection) => collection.name === GOODBIT_COLLECTION)
          ?.audioDeviceIds ?? [],
      // GoodBit's own if it has one, otherwise the best the machine offers, so
      // the interface can say what the situation is either way.
      setupWrittenAt: readManifest()?.writtenAt ?? null,
    };
  }
}
