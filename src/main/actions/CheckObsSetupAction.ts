import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { readObs, type ObsProfile, type ObsSceneCollection } from '../services/obs/config.js';
import { findObsExecutable, obsIsInstalled, obsIsRunning } from '../services/obs/paths.js';
import { bestPython, ownPython } from '../services/obs/python.js';
import { installedSmartReplays, SMART_REPLAYS } from '../services/obs/smartReplays.js';
import { GOODBIT_COLLECTION, GOODBIT_PROFILE, readManifest } from '../services/obs/setup.js';
import { loadSettings } from '../settings.js';
import { INCOMING_DIR_NAME } from '../services/capture/incoming.js';

/**
 * What is wrong with this machine's OBS, in sentences.
 *
 * Read only, on purpose, and useful entirely on its own. Most people whose
 * clips are not appearing have exactly one setting wrong and no way to know
 * which, and naming it is worth more than fixing it silently would be.
 */

export type FindingLevel = 'ok' | 'warning' | 'blocker';

export interface ObsFinding {
  id: string;
  level: FindingLevel;
  title: string;
  detail: string;
  /** True when GoodBit's own setup would resolve this. */
  fixable: boolean;
}

export interface ObsStatus {
  installed: boolean;
  running: boolean;
  executable: string | null;
  /** Ready means: a buffer, a hotkey, a matching folder and a way to sort. */
  ready: boolean;
  findings: ObsFinding[];
  activeProfileName: string | null;
  goodbitProfileExists: boolean;
  /**
   * Has this person built scenes worth leaving alone?
   *
   * Not the same as "has a scene collection". OBS creates an empty one called
   * Untitled on its first run, and treating that as somebody's work meant the
   * setup skipped making its own: OBS then opened the GoodBit profile with an
   * empty scene and warned that it had no video sources, which it did not.
   *
   * A collection counts when something in it captures something.
   */
  hasScenes: boolean;
  /**
   * Which profile these findings are about.
   *
   * GoodBit never switches the active profile: it makes its own and names it
   * on the command line when it starts OBS. So once that profile exists, it is
   * the one worth judging, and judging the active one instead would report a
   * buffer as off immediately after turning it on.
   */
  judging: 'goodbit' | 'active';
  videosRoot: string;
  recordingPath: string | null;
  replayBufferSeconds: number | null;
  hotkey: string | null;
  /** What the GoodBit scene already captures, so the setup can show it ticked. */
  audioDeviceIds: string[];
  python: { version: string; directory: string; usable: boolean } | null;
  pythonConfigured: string | null;
  script: { installed: boolean; matchesPin: boolean; version: string; loadedInCollection: boolean };
  setupWrittenAt: string | null;
}

/** Same drive, case insensitively, which is what the script needs to move a file. */
function sameDrive(a: string, b: string): boolean {
  return path.parse(a).root.toLowerCase() === path.parse(b).root.toLowerCase();
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

export class CheckObsSetupAction extends BaseAction<void, ObsStatus> {
  async execute(): Promise<ObsStatus> {
    const obs = readObs();
    const settings = loadSettings();
    const videosRoot = settings.videosRoot;
    const findings: ObsFinding[] = [];

    const [running, executable, python, own, installed] = await Promise.all([
      obsIsRunning(),
      findObsExecutable(),
      bestPython(),
      ownPython(),
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

    const script = installedSmartReplays();
    const collectionScript = collection?.smartReplays ?? null;

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
       * a game folder itself. Recording straight into the videos root is what
       * 1.4.0 did, and it still works while Smart Replays is the one sorting,
       * so it is not an error until that machine is migrated.
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
     * Not a finding any more.
     *
     * Until 1.4.0 a folder per game needed a third party script and a private
     * Python inside OBS, so its absence was a warning. GoodBit now names the
     * clip itself from the program that was in front while it was recording,
     * so an OBS with no scripts at all is the healthy state.
     */
    if (collectionScript) {
      findings.push({
        id: 'script-present',
        level: 'ok',
        title: 'Smart Replays is still installed',
        detail:
          'GoodBit sorts clips itself now, so the script and its Python are no longer needed. Setting up again removes them.',
        fixable: true,
      });
    }

    if (collectionScript) {
      const base = collectionScript.settings.clips_base_path;
      if (typeof base === 'string' && base && videosRoot) {
        if (!samePath(base, videosRoot)) {
          findings.push({
            id: 'script-path-mismatch',
            level: 'warning',
            title: 'Smart Replays sorts clips somewhere else',
            detail: `It writes into ${base}, GoodBit watches ${videosRoot}.`,
            fixable: true,
          });
        }
        if (profile?.recordingPath && !sameDrive(base, profile.recordingPath)) {
          findings.push({
            id: 'script-drive-mismatch',
            level: 'blocker',
            title: 'Smart Replays cannot move your clips',
            detail: `Its folder (${base}) is on a different drive from OBS's recording folder (${profile.recordingPath}), and it moves files rather than copying them.`,
            fixable: false,
          });
        }
      }

      if (collectionScript.settings.clips_save_to_folder === false) {
        findings.push({
          id: 'script-sorting-off',
          level: 'warning',
          title: 'Smart Replays is not sorting into folders',
          detail: 'Its "sort clips into folders" option is off, so every clip lands in one folder.',
          fixable: true,
        });
      }
    }

    // Only about OBS's own key. Whether GoodBit put it there or the user did
    // makes no difference to whether a script will run.
    if (installed && collectionScript && !obs.pythonPath) {
      findings.push({
        id: 'python-unset',
        level: 'blocker',
        title: 'OBS has no Python, so it is running no scripts',
        detail: own?.usable
          ? "GoodBit has its own Python ready; OBS just has not been pointed at it."
          : 'Setting this up installs one into GoodBit\'s own folder and points OBS at it.',
        fixable: true,
      });
    }

    // A Python OBS cannot load looks exactly like a Python that works, until
    // you read an OBS log. Worth saying out loud when it is what OBS is on.
    if (obs.pythonPath && own && !obs.pythonPath.toLowerCase().includes('goodbit')) {
      const tooNew = python?.tooNew === true;
      findings.push({
        id: 'python-elsewhere',
        level: tooNew ? 'warning' : 'ok',
        title: tooNew
          ? 'OBS is pointed at a Python it cannot load'
          : "OBS is pointed at a Python that is not GoodBit's",
        detail: tooNew
          ? `${obs.pythonPath} is too new for OBS, which loads 3.10 to 3.12 and reports it nowhere except its own log.`
          : `${obs.pythonPath}. GoodBit's own copy is at ${own.directory}, and setting up again points OBS there.`,
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
      python: (own ?? python)
        ? {
            version: (own ?? python)!.version,
            directory: (own ?? python)!.directory,
            usable: (own ?? python)!.usable,
          }
        : null,
      pythonConfigured: obs.pythonPath,
      script: {
        installed: Boolean(script),
        matchesPin: script?.matchesPin ?? false,
        version: SMART_REPLAYS.version,
        loadedInCollection: Boolean(collectionScript),
      },
      setupWrittenAt: readManifest()?.writtenAt ?? null,
    };
  }
}
