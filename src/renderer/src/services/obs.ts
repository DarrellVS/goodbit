import axios from '@renderer/axios';

/**
 * The OBS side of the app, as the window sees it.
 *
 * One function per endpoint, like every other service here. Nothing in this
 * file decides anything: the main process owns every judgement about what is
 * wrong and what would be written.
 */

/*
 * The types are the shared contract, not a second copy.
 *
 * They were written out again here, beside the functions that read them, and
 * three of them had already drifted from what main produces. `src/shared` is
 * where both processes agree now, and they are re-exported from this file so
 * every component that imports a type from the obs service is unchanged.
 */
export type {
  AudioDevice,
  CaptureDisplay,
  ChangeKind,
  FindingLevel,
  ObsFinding,
  ObsInstallOption,
  ObsInstallPlan,
  ObsSetupPlan,
  ObsSetupPlanResponse,
  ObsSetupRequest,
  ObsSetupResult,
  ObsStatus,
  PlannedChange,
} from '@shared/index';
import type { ObsSetupPlanResponse, ObsStatus, CaptureDisplay, AudioDevice, ObsInstallPlan, ObsSetupRequest, ObsSetupResult } from '@shared/index';

export async function getAudioDevices(): Promise<AudioDevice[]> {
  const { data } = await axios.get<AudioDevice[]>('/obs/audio-devices');
  return data;
}

export async function getCaptureDisplays(): Promise<CaptureDisplay[]> {
  const { data } = await axios.get<CaptureDisplay[]>('/obs/displays');
  return data;
}

export async function planObsSetup(request: ObsSetupRequest): Promise<ObsSetupPlanResponse> {
  const { data } = await axios.post<ObsSetupPlanResponse>('/obs/plan', request);
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

export async function getObsStatus(): Promise<ObsStatus> {
  const { data } = await axios.get<ObsStatus>('/obs/status');
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
