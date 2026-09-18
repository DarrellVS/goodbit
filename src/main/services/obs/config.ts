import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { iniValue, readIni } from './ini.js';
import { obsConfigDir, profilesDir, profileFolders, scenesDir, sceneCollectionFiles } from './paths.js';

/**
 * Reading OBS's configuration, which is the whole of phase one.
 *
 * Nothing here writes. A read only answer to "is OBS set up to feed GoodBit"
 * is most of the value of this feature and carries none of the risk, and the
 * writer needs this reader anyway to know what it would be changing.
 */

export interface ObsProfile {
  /** The folder under `basic/profiles`, which is what `--profile` does not take. */
  folder: string;
  /** `[General] Name`, which is what the user sees and what `--profile` takes. */
  name: string;
  /** `Simple` or `Advanced`. Decides which half of `basic.ini` is live. */
  outputMode: 'Simple' | 'Advanced';
  replayBufferEnabled: boolean;
  replayBufferSeconds: number | null;
  replayBufferMb: number | null;
  recordingPath: string | null;
  /** The raw hotkey blob, either shape. Null when nothing is bound. */
  saveReplayHotkey: string | null;
  /** A readable version of the same thing, for the UI. */
  saveReplayKey: string | null;
  baseResolution: string | null;
  colorSpace: string | null;
  colorFormat: string | null;
  /**
   * Which audio tracks this profile records, as a bitmask.
   *
   * Null when the key is absent, which OBS treats as track 1 alone. Read so
   * the status can say what tonight's recording will hold rather than what the
   * setup wrote once: a profile edited by hand since is the case worth
   * catching, and nothing else would notice.
   */
  recTracks: number | null;
}

export interface ObsScriptEntry {
  path: string;
  settings: Record<string, unknown>;
}

export interface ObsSceneCollection {
  file: string;
  name: string;
  scriptCount: number;
  /**
   * The first script this collection loads, if it loads any.
   *
   * Naming a clip is GoodBit's own job, so a collection holding a script is
   * something the setup offers to take out rather than something it manages.
   */
  scriptEntry: ObsScriptEntry | null;
  sourceKinds: string[];
  /**
   * The audio endpoints this collection already captures, by device id.
   *
   * Read back so the setup can show what is already chosen rather than
   * offering the default again. Somebody who picked four Wave Link devices
   * last time and reopens the wizard should see those four ticked, not be
   * asked to remember which ones they were.
   */
  audioDeviceIds: string[];
}

export interface ObsSnapshot {
  installed: boolean;
  /** 31 and up split `global.ini` into `user.ini`; both are read. */
  activeProfileFolder: string | null;
  activeCollectionFile: string | null;
  profiles: ObsProfile[];
  collections: ObsSceneCollection[];
  activeProfile: ObsProfile | null;
  activeCollection: ObsSceneCollection | null;
}

/** OBS 31 moved these out of `global.ini`; read both, newest first. */
function userConfig(): ReturnType<typeof readIni> {
  const userIni = path.join(obsConfigDir(), 'user.ini');
  if (existsSync(userIni)) return readIni(userIni);
  return readIni(path.join(obsConfigDir(), 'global.ini'));
}

/**
 * The per-user config file, which differs by OBS version.
 *
 * OBS 31 split `global.ini` into `user.ini`. With neither present, OBS has been
 * installed but never opened, and the version shipping today is past that
 * split, so writing `global.ini` would put a key in the file it no longer
 * reads.
 */
export function userConfigFile(): string {
  const userIni = path.join(obsConfigDir(), 'user.ini');
  const globalIni = path.join(obsConfigDir(), 'global.ini');
  if (existsSync(userIni)) return userIni;
  if (existsSync(globalIni)) return globalIni;
  return userIni;
}

/**
 * A bound key, in words.
 *
 * Two shapes exist. The modern one is keyed by the frontend hotkey name and
 * holds a `bindings` array; the legacy one is keyed by the output object's
 * name and holds the array under `ReplayBuffer.Save`. OBS migrates the second
 * into the first on load, so a profile written years ago still has the old
 * shape and both have to be read.
 */
function readableKey(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bindings = (parsed.bindings ?? parsed['ReplayBuffer.Save']) as
      | Array<Record<string, unknown>>
      | undefined;
    const first = bindings?.[0];
    if (!first || typeof first.key !== 'string') return null;

    const parts: string[] = [];
    if (first.control) parts.push('Ctrl');
    if (first.alt) parts.push('Alt');
    if (first.shift) parts.push('Shift');
    parts.push(first.key.replace(/^OBS_KEY_/, ''));
    return parts.join(' + ');
  } catch {
    return null;
  }
}

function numberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** OBS escapes backslashes in ini values, so a path reads `C:\\Users\\…`. */
function unescapePath(value: string | null): string | null {
  return value === null ? null : value.replace(/\\\\/g, '\\');
}

export function readProfile(folder: string): ObsProfile | null {
  const file = path.join(profilesDir(), folder, 'basic.ini');
  if (!existsSync(file)) return null;
  const ini = readIni(file);

  const advanced = iniValue(ini, 'Output', 'Mode') === 'Advanced';
  const section = advanced ? 'AdvOut' : 'SimpleOutput';

  const modern = iniValue(ini, 'Hotkeys', 'OBSBasic.SaveReplayBuffer');
  const legacy = iniValue(ini, 'Hotkeys', 'ReplayBuffer');
  const hotkey = modern ?? legacy;

  const base = iniValue(ini, 'Video', 'BaseCX');
  const baseY = iniValue(ini, 'Video', 'BaseCY');

  return {
    folder,
    name: iniValue(ini, 'General', 'Name') ?? folder,
    outputMode: advanced ? 'Advanced' : 'Simple',
    replayBufferEnabled: iniValue(ini, section, 'RecRB') === 'true',
    replayBufferSeconds: numberOrNull(iniValue(ini, section, 'RecRBTime')),
    replayBufferMb: numberOrNull(iniValue(ini, section, 'RecRBSize')),
    recordingPath: unescapePath(
      advanced ? iniValue(ini, 'AdvOut', 'RecFilePath') : iniValue(ini, 'SimpleOutput', 'FilePath'),
    ),
    saveReplayHotkey: hotkey,
    saveReplayKey: readableKey(hotkey),
    baseResolution: base && baseY ? `${base}x${baseY}` : null,
    colorSpace: iniValue(ini, 'Video', 'ColorSpace'),
    colorFormat: iniValue(ini, 'Video', 'ColorFormat'),
    recTracks: numberOrNull(iniValue(ini, section, 'RecTracks')),
  };
}

export function readCollection(file: string): ObsSceneCollection | null {
  const full = path.join(scenesDir(), `${file}.json`);
  if (!existsSync(full)) return null;

  try {
    const parsed = JSON.parse(readFileSync(full, 'utf-8')) as {
      name?: string;
      sources?: Array<{ id?: string; settings?: { device_id?: string } }>;
      modules?: { 'scripts-tool'?: ObsScriptEntry[] };
    };

    const scripts = parsed.modules?.['scripts-tool'] ?? [];

    return {
      file,
      name: parsed.name ?? file,
      scriptCount: scripts.length,
      scriptEntry: scripts.find((entry) => Boolean(entry.path)) ?? null,
      sourceKinds: Array.from(
        new Set((parsed.sources ?? []).map((source) => source.id).filter(Boolean) as string[]),
      ),
      // Output captures only. An input capture is a microphone, which the
      // wizard lists separately and stores the same way.
      audioDeviceIds: Array.from(
        new Set(
          (parsed.sources ?? [])
            .filter((source) => (source.id ?? '').startsWith('wasapi_'))
            .map((source) => source.settings?.device_id)
            .filter(Boolean) as string[],
        ),
      ),
    };
  } catch {
    return null;
  }
}

export function readObs(): ObsSnapshot {
  const installed = existsSync(path.join(obsConfigDir(), 'basic'));
  const config = userConfig();

  const activeProfileFolder = iniValue(config, 'Basic', 'ProfileDir');
  // OBS stores this with the extension, the files are listed without it.
  const activeCollectionFile = (iniValue(config, 'Basic', 'SceneCollectionFile') ?? '').replace(
    /\.json$/,
    '',
  ) || null;

  const profiles = profileFolders()
    .map(readProfile)
    .filter((profile): profile is ObsProfile => profile !== null);

  const collections = sceneCollectionFiles()
    .map(readCollection)
    .filter((collection): collection is ObsSceneCollection => collection !== null);

  return {
    installed,
    activeProfileFolder,
    activeCollectionFile,
    profiles,
    collections,
    activeProfile: profiles.find((p) => p.folder === activeProfileFolder) ?? null,
    activeCollection: collections.find((c) => c.file === activeCollectionFile) ?? null,
  };
}
