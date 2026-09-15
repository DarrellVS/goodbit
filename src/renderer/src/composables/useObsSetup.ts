import { computed, ref } from 'vue';
import {
  applyObsSetup,
  getObsAliases,
  getObsInstallPlan,
  getAudioDevices,
  getCaptureDisplays,
  getObsStatus,
  getPythonState,
  getScriptInfo,
  installPython,
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
  type PythonState,
  type ScriptInfo,
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
  const script = ref<ScriptInfo | null>(null);
  const aliasNames = ref<string[]>([]);

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

  const python = ref<PythonState | null>(null);
  const installingPython = ref(false);

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
      {
        key: 'installScript',
        label: 'Sort clips into a folder per game',
        description:
          'OBS cannot do this on its own, so this installs Smart Replays, a script by qvvonk, and the Python it runs on.',
        // Never blocked on the machine having a Python: GoodBit installs its
        // own, into its own folder, as part of applying this.
        enabled: true,
        /*
         * Not a choice.
         *
         * GoodBit reads a folder per game and the folder name is the game
         * name. Without this every clip lands in one folder, the library shows
         * one game, and nothing else in the app works properly. A switch here
         * offers somebody the option of a broken install.
         */
        required: true,
      },
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
    // Pointing OBS at Python is what the script step needs, so it goes wherever
    // that goes.
    selected.setPythonPath = selected.installScript === true;
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
    const [info, aliases, screens, pythons, devices] = await Promise.allSettled([
      getScriptInfo(),
      getObsAliases(),
      getCaptureDisplays(),
      getPythonState(),
      getAudioDevices(),
    ]);
    if (devices.status === 'fulfilled') audio.value = devices.value;
    if (info.status === 'fulfilled') script.value = info.value;
    if (aliases.status === 'fulfilled') aliasNames.value = aliases.value.names;
    if (pythons.status === 'fulfilled') python.value = pythons.value;
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

  /**
   * Install a Python of GoodBit's own.
   *
   * For the machine with none OBS can load, which includes a machine with a
   * perfectly good Python that happens to be too new. Refreshing afterwards is
   * what re-enables the sorting step.
   */
  async function addPython(): Promise<void> {
    installingPython.value = true;
    error.value = null;
    try {
      await installPython();
      await refresh();
      await loadDetails();
      // The step was disabled for want of a Python; it can be had now.
      const step = steps.value.find((candidate) => candidate.key === 'installScript');
      if (step) {
        step.requires = undefined;
        step.enabled = true;
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      installingPython.value = false;
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
    script,
    aliasNames,
    steps,
    bufferSeconds,
    hotkey,
    displays,
    displayId,
    display,
    audio,
    audioIds,
    python,
    installingPython,
    addPython,
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
