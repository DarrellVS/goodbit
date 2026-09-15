import axios from '../axios';

/**
 * The OBS side of the app, as the window sees it.
 *
 * One function per endpoint, like every other service here. Nothing in this
 * file decides anything: the main process owns every judgement about what is
 * wrong and what would be written.
 */

export type FindingLevel = 'ok' | 'warning' | 'blocker';

export interface ObsFinding {
  id: string;
  level: FindingLevel;
  title: string;
  detail: string;
  fixable: boolean;
}

export interface ObsStatus {
  installed: boolean;
  running: boolean;
  executable: string | null;
  ready: boolean;
  findings: ObsFinding[];
  activeProfileName: string | null;
  goodbitProfileExists: boolean;
  /** Scenes with something in them, rather than OBS's empty Untitled. */
  hasScenes: boolean;
  /** Whether the findings describe GoodBit's own profile or the active one. */
  judging: 'goodbit' | 'active';
  videosRoot: string;
  recordingPath: string | null;
  replayBufferSeconds: number | null;
  hotkey: string | null;
  python: { version: string; directory: string; usable: boolean } | null;
  pythonConfigured: string | null;
  script: { installed: boolean; matchesPin: boolean; version: string; loadedInCollection: boolean };
  setupWrittenAt: string | null;
}

export interface PlannedChange {
  kind: 'create' | 'modify' | 'download';
  title: string;
  file: string;
  /** What the change means, in sentences, for the dialog to lead with. */
  summary: string[];
  details: Array<{ key: string; value: string; was?: string }>;
}

export interface ObsSetupPlan {
  changes: PlannedChange[];
  blockers: string[];
  notes: string[];
  obsRunning: boolean;
}

export interface CaptureDisplay {
  id: number;
  label: string;
  primary: boolean;
  width: number;
  height: number;
  frequency: number;
  /** Null when Windows would not say which device this screen is. */
  monitorId: string | null;
  hdrSupported: boolean;
  /** HDR is on for this screen right now, which decides the colour settings. */
  hdrEnabled: boolean;
}

export interface ObsSetupRequest {
  createProfile?: boolean;
  displayId?: number;
  captureDesktop?: boolean;
  /** OBS device ids. Absent means the system's own output, alone. */
  audioDeviceIds?: string[];
  enableReplayBuffer?: boolean;
  replayBufferSeconds?: number;
  bindHotkey?: boolean;
  hotkey?: string;
  createScene?: boolean;
  installScript?: boolean;
  namingMode?: number;
  setPythonPath?: boolean;
}

export interface ObsSetupResult {
  applied: boolean;
  summary: string[];
  scriptPath: string | null;
  profile: string | null;
  collection: string | null;
}

export interface ScriptInfo {
  name: string;
  version: string;
  author: string;
  licence: string;
  repository: string;
  forumPage: string;
  url: string;
  commit: string;
  pythonDownload: string;
}

export interface ObsInstallPlan {
  alreadyInstalled: boolean;
  options: Array<{ method: 'winget' | 'download' | 'manual'; label: string; detail: string }>;
  installer: { version: string; name: string; bytes: number } | null;
  downloadPage: string;
}

export async function getObsStatus(): Promise<ObsStatus> {
  const { data } = await axios.get<ObsStatus>('/obs/status');
  return data;
}

export async function getScriptInfo(): Promise<ScriptInfo> {
  const { data } = await axios.get<ScriptInfo>('/obs/script-info');
  return data;
}

export async function getObsAliases(): Promise<{ count: number; names: string[] }> {
  const { data } = await axios.get<{ count: number; names: string[] }>('/obs/aliases');
  return data;
}

export interface PythonState {
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

export async function getPythonState(): Promise<PythonState> {
  const { data } = await axios.get<PythonState>('/obs/python');
  return data;
}

export async function installPython(): Promise<{ version: string; directory: string }> {
  const { data } = await axios.post<{ version: string; directory: string }>('/obs/python/install');
  return data;
}

export interface AudioDevice {
  /** What OBS stores, verbatim. */
  id: string;
  name: string;
  /** The hardware behind it, since three endpoints can all be called Speakers. */
  description: string;
  flow: 'output' | 'input';
  /** The system default, which OBS writes as the literal `default`. */
  isDefault: boolean;
}

export async function getAudioDevices(): Promise<AudioDevice[]> {
  const { data } = await axios.get<AudioDevice[]>('/obs/audio-devices');
  return data;
}

export async function getCaptureDisplays(): Promise<CaptureDisplay[]> {
  const { data } = await axios.get<CaptureDisplay[]>('/obs/displays');
  return data;
}

export async function planObsSetup(request: ObsSetupRequest): Promise<ObsSetupPlan> {
  const { data } = await axios.post<ObsSetupPlan>('/obs/plan', request);
  return data;
}

export async function applyObsSetup(request: ObsSetupRequest): Promise<ObsSetupResult> {
  const { data } = await axios.post<ObsSetupResult>('/obs/apply', request);
  return data;
}

export async function skipObsWizard(): Promise<void> {
  await axios.post('/obs/skip-wizard');
}

export async function undoObsSetup(): Promise<{ removed: string[]; restored: string[] }> {
  const { data } = await axios.post<{ removed: string[]; restored: string[] }>('/obs/undo');
  return data;
}

export async function getObsInstallPlan(): Promise<ObsInstallPlan> {
  const { data } = await axios.get<ObsInstallPlan>('/obs/install-plan');
  return data;
}

export async function installObs(method?: 'winget' | 'download'): Promise<{ installed: boolean; message: string }> {
  const { data } = await axios.post<{ installed: boolean; message: string }>('/obs/install', { method });
  return data;
}

export async function launchObs(options: { startReplayBuffer?: boolean; minimized?: boolean } = {}): Promise<{
  launched: boolean;
  alreadyRunning: boolean;
}> {
  const { data } = await axios.post<{ launched: boolean; alreadyRunning: boolean }>(
    '/obs/launch',
    options,
  );
  return data;
}
