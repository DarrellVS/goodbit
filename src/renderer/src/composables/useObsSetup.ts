import { computed, ref } from 'vue';
import {
  applyObsSetup,
  getObsInstallPlan,
  getAudioDevices,
  getCaptureDisplays,
  getObsStatus,
  installObs,
  launchObs,
  planObsSetup,
  undoObsSetup,
  type ObsInstallPlan,
  type ObsSetupPlan,
  type ObsSetupRequest,
  type AudioDevice,
  type CaptureDisplay,
  type ObsStatus,
} from '../services/obs';

/**
 * Everything the OBS setup needs, in one place.
 *
 * Shared by the card in Settings and by the first run wizard, because they ask
 * the same questions and differ only in how much room they have to ask them.
 */

export interface SetupStep {
  key: keyof ObsSetupRequest;
  label: string;
  description: string;
  enabled: boolean;
  /** Turned off because it would be wrong here, not because the user said so. */
  advisedOff?: string;
  /** Cannot be turned on until this is dealt with. */
  requires?: string;
  /** Not a preference: the setup does not work without it. */
  required?: boolean;
}

export function useObsSetup() {
  const status = ref<ObsStatus | null>(null);
  const plan = ref<ObsSetupPlan | null>(null);
  const installPlan = ref<ObsInstallPlan | null>(null);

  const loading = ref(false);
  const working = ref(false);
  const error = ref<string | null>(null);
  const result = ref<string[] | null>(null);

  const bufferSeconds = ref(30);
  const hotkey = ref('OBS_KEY_F8');

  /**
   * Which screen this is for, which decides the canvas size.
   *
   * It has to be asked. OBS fills a new profile with 1920x1080 at 30, so a
   * setup that says nothing records an ultrawide letterboxed at half its
   * resolution, and nobody notices until they watch a clip back.
   */
  /**
   * The audio devices, and which of them to record.
   *
   * Defaulted to the system's own output alone, which is the answer for
   * anybody who has never thought about it, and is also what OBS calls
   * "Desktop Audio". Anyone with a voice chat on its own device, or a
   * microphone worth keeping, can say so here and each one arrives as its own
   * fader rather than mixed into one.
   */
  const audio = ref<AudioDevice[]>([]);
  const audioIds = ref<string[]>(['default']);


  const displays = ref<CaptureDisplay[]>([]);
  const displayId = ref<number | null>(null);

  const steps = ref<SetupStep[]>([]);

  /**
   * The default answers, which depend on what is already there.
   *
   * The scene step is the one that matters. Someone who already uses OBS has
   * scenes they have built and nothing to learn from a scene GoodBit makes, so
   * it is off for them and on for a machine with nothing in it.
   */
  function buildSteps(current: ObsStatus): SetupStep[] {
    /*
     * Someone who has built scenes has nothing to learn from a scene GoodBit
     * makes, so that step starts off for them.
     *
     * Having a profile is not the test, and using it as one was a bug: a fresh
     * OBS has a profile and an empty collection called Untitled, so the step
     * defaulted off, no scene was created, and OBS opened on an empty one and
     * said it had no video sources.
     */
    const usesOwnScenes = current.hasScenes && !current.goodbitProfileExists;

    return [
      {
        key: 'createProfile',
        label: 'Create a profile called GoodBit',
        description: 'Your own profiles are left exactly as they are.',
        enabled: true,
      },
      {
        key: 'enableReplayBuffer',
        label: `Turn the replay buffer on`,
        description: 'The last few seconds are kept in memory, ready to save.',
        enabled: true,
      },
      {
        key: 'bindHotkey',
        label: 'Bind a key to Save Replay',
        description: current.hotkey
          ? `Your current profile uses ${current.hotkey}.`
          : 'Nothing is bound at the moment.',
        enabled: true,
      },
      {
        key: 'createScene',
        label: 'Create a scene that captures the game',
        description: 'Anything running fullscreen, plus desktop audio.',
        enabled: !usesOwnScenes,
        advisedOff: usesOwnScenes
          ? 'You already have scenes. GoodBit leaves them alone unless you ask.'
          : undefined,
      },
      {
        key: 'captureDesktop',
        label: 'Also capture the screen itself',
        description:
          'Game capture alone records nothing outside a fullscreen game, so a clip of a browser or a windowed game comes out black.',
        enabled: true,
      },
      /*
       * There is no "sort clips into folders" step.
       *
       * OBS names a recording after the clock and cannot be taught otherwise,
       * so GoodBit does the sorting: OBS records into a staging folder, GoodBit
       * asks Windows which program was in front while the clip was recording,
       * and files it under that game. Nothing to decide and nothing to install.
       */
    ];
  }

  const request = computed<ObsSetupRequest>(() => {
    const selected: ObsSetupRequest = {
      replayBufferSeconds: bufferSeconds.value,
      hotkey: hotkey.value,
      ...(displayId.value === null ? {} : { displayId: displayId.value }),
      audioDeviceIds: [...audioIds.value],
    };
    for (const step of steps.value) {
      (selected as Record<string, unknown>)[step.key] = step.enabled;
    }
    return selected;
  });

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const current = await getObsStatus();
      status.value = current;
      if (!steps.value.length) steps.value = buildSteps(current);
      if (current.replayBufferSeconds) bufferSeconds.value = current.replayBufferSeconds;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  }

  async function loadDetails(): Promise<void> {
    const [screens, devices] = await Promise.allSettled([
      getCaptureDisplays(),
      getAudioDevices(),
    ]);
    if (devices.status === 'fulfilled') audio.value = devices.value;

    /*
     * Show what is already set, rather than the default again.
     *
     * Reopening the wizard used to reset this to "whatever Windows is using",
     * so somebody who had picked four Wave Link devices was quietly offered a
     * setup that would replace them with one, and the only way to know was to
     * read the preview carefully. The scene knows what it captures; ask it.
     *
     * Only devices this machine still has: an endpoint that has since been
     * unplugged would otherwise sit ticked and invisible.
     */
    const already = status.value?.audioDeviceIds ?? [];
    if (already.length > 0) {
      const present = new Set(audio.value.map((device) => device.id));
      const kept = already.filter((id) => present.has(id));
      if (kept.length > 0) audioIds.value = kept;
    }
    if (screens.status === 'fulfilled') {
      displays.value = screens.value;
      if (displayId.value === null) {
        displayId.value = (screens.value.find((screen) => screen.primary) ?? screens.value[0])?.id ?? null;
      }
    }
  }

  /** The screen currently chosen, for the dialog to describe. */
  const display = computed(
    () => displays.value.find((candidate) => candidate.id === displayId.value) ?? null,
  );

  async function refreshPlan(): Promise<void> {
    error.value = null;
    try {
      plan.value = await planObsSetup(request.value);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  /**
   * The defaults, applied without asking anything.
   *
   * Every answer this wizard collects has a right answer for almost everybody:
   * the main screen, thirty seconds, F8, the system's own sound, sorted into
   * folders. The long route exists for the people who want to change one of
   * them, not because the defaults are a guess.
   */
  function useDefaults(): void {
    const current = status.value;
    bufferSeconds.value = 30;
    hotkey.value = 'OBS_KEY_F8';
    audioIds.value = ['default'];
    displayId.value =
      (displays.value.find((screen) => screen.primary) ?? displays.value[0])?.id ?? null;

    for (const step of steps.value) {
      step.enabled = step.key === 'createScene' ? !current?.hasScenes : true;
    }
  }

  async function apply(): Promise<boolean> {
    working.value = true;
    error.value = null;
    try {
      const applied = await applyObsSetup(request.value);
      result.value = applied.summary;
      await refresh();
      return true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      return false;
    } finally {
      working.value = false;
    }
  }

  async function undo(): Promise<void> {
    working.value = true;
    try {
      await undoObsSetup();
      result.value = null;
      await refresh();
    } finally {
      working.value = false;
    }
  }

  async function loadInstallPlan(): Promise<void> {
    installPlan.value = await getObsInstallPlan();
  }

  async function install(method?: 'winget' | 'download'): Promise<string> {
    working.value = true;
    error.value = null;
    try {
      const outcome = await installObs(method);
      await refresh();
      return outcome.message;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      working.value = false;
    }
  }

  async function start(options: { minimized?: boolean } = {}): Promise<boolean> {
    const outcome = await launchObs({ startReplayBuffer: true, minimized: options.minimized });
    await refresh();
    return outcome.launched || outcome.alreadyRunning;
  }

  return {
    status,
    plan,
    installPlan,
    steps,
    bufferSeconds,
    hotkey,
    displays,
    displayId,
    display,
    audio,
    audioIds,
    loading,
    working,
    error,
    result,
    request,
    refresh,
    loadDetails,
    useDefaults,
    refreshPlan,
    apply,
    undo,
    loadInstallPlan,
    install,
    start,
  };
}
