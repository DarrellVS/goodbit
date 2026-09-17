import { computed, onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { SetupStep, useObsSetup } from '@renderer/composables/obs/useObsSetup';
import { skipObsWizard } from '@renderer/services/obs';
import { useToastStore } from '@renderer/stores/toast';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();
import {
  continueDisabled,
  currentPageId,
  invitedStepEnabled,
  isPlanBlocked,
  quickSummaryTiles,
  visibleObsSetupPages,
  type ObsSetupPageId,
  type ObsSetupRoute,
} from '@renderer/utils/obsSetupWizard';

/**
 * Where the wizard is, and everything it does that is not drawing.
 *
 * `useObsSetup` is the other half and owns the data: the status, the plan, the
 * displays, the devices, and the calls that fetch and apply them. It is shared
 * with the card in Settings. This is the wizard's own state, which only the
 * dialog has: which page is showing, which route was chosen, the two intervals
 * that watch for the world changing underneath a page, and the answers to the
 * one blocker the app can do something about.
 *
 * It is one composable rather than three because every piece of it is about
 * the same thing, a person walking eight pages: the page decides which
 * interval runs, landing on the preview is what fetches it, and the install
 * page's progress bar is the same progress the preview shows while it applies.
 * Splitting it would mean each half holding a handle on the other.
 *
 * The step components are presentational and take props. `steps` is the one
 * exception worth naming: the switches write through `setStepEnabled`, so the
 * array is only ever mutated here and never by a child holding a prop.
 */
export function useObsSetupWizard(options: {
  setup: ReturnType<typeof useObsSetup>;
  open: MaybeRefOrGetter<boolean>;
  /**
   * Skip the quick-or-thorough question and go straight to the questions.
   *
   * Changing a setup that already works is not the same job as making one.
   */
  directToFull: MaybeRefOrGetter<boolean>;
  /** What the website's guide asked for, when the dialog was opened by a link. */
  invitedSteps: MaybeRefOrGetter<string[] | null>;
  invitedBuffer: MaybeRefOrGetter<number | null>;
  invitedHotkey: MaybeRefOrGetter<string | null>;
}) {
  const { setup } = options;
  const { status, plan, steps, bufferSeconds, hotkey, display, audio, audioIds } = setup;
  const toast = useToastStore();

  const route = ref<ObsSetupRoute>('full');
  const at = ref(0);

  const pages = computed(() =>
    visibleObsSetupPages({
      // An unread status is treated as installed, so the install page does not
      // flash up on a machine that has OBS while the first read is in flight.
      installed: status.value ? status.value.installed : true,
      directToFull: toValue(options.directToFull),
      route: route.value,
    }),
  );

  const page = computed<ObsSetupPageId>(() => currentPageId(pages.value, at.value));

  /** Quick folds the full change list away; this opens it. */
  const showEverything = ref(false);

  const waitingForClip = ref(false);
  const firstClip = ref<{ game: string } | null>(null);
  const installing = ref(false);
  const installProgress = ref<{ percent?: number; message: string } | null>(null);

  /*
   * The watcher already sees a new file the moment OBS writes one, so proving
   * the whole chain works end to end costs nothing beyond listening for it.
   */
  let detach: (() => void) | null = null;

  onMounted(() => {
    detach =
      window.goodbit?.onServiceEvent((raw) => {
        const event = raw as {
          type: string;
          game?: string;
          stage?: string;
          percent?: number;
          message?: string;
        };

        if (event.type === 'clip-added' && waitingForClip.value) {
          firstClip.value = { game: event.game ?? 'Your clip' };
          waitingForClip.value = false;
          return;
        }

        if (event.type === 'obs-setup-progress') {
          installProgress.value =
            event.stage === 'done' || event.stage === 'failed'
              ? null
              : { percent: event.percent, message: event.message ?? '' };
        }
      }) ?? null;
  });

  /*
   * Watch for OBS appearing, while that page is on screen.
   *
   * The installer is another program: it finishes without telling this one, and
   * the status was read once when the dialog opened. That left the Continue
   * button greyed out after a successful install, with no way past it but
   * restarting GoodBit.
   *
   * Only while the page is showing, so nothing polls in the background.
   */
  let watching: ReturnType<typeof setInterval> | null = null;

  function stopWatching(): void {
    if (watching) clearInterval(watching);
    watching = null;
  }

  watch(
    () => page.value === 'install' && toValue(options.open),
    (onInstallPage) => {
      stopWatching();
      if (!onInstallPage) return;

      watching = setInterval(async () => {
        await setup.refresh();
        if (!status.value?.installed) return;

        stopWatching();
        // However OBS arrived, including by hand from the download page, this is
        // the last moment before somebody opens it for the first time.
        await skipObsWizard().catch(() => {});
      }, 2500);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    detach?.();
    stopWatching();
    stopRecheckingPlan();
  });

  watch(
    () => toValue(options.open),
    async (open) => {
      if (!open) return;
      at.value = 0;
      route.value = 'full';
      showEverything.value = false;
      firstClip.value = null;
      waitingForClip.value = false;
      await setup.refresh();
      await setup.loadDetails();
      if (status.value && !status.value.installed) await setup.loadInstallPlan();

      const invitedBuffer = toValue(options.invitedBuffer);
      const invitedHotkey = toValue(options.invitedHotkey);
      if (invitedBuffer) bufferSeconds.value = invitedBuffer;
      if (invitedHotkey) hotkey.value = invitedHotkey;

      const invitedSteps = toValue(options.invitedSteps);
      if (invitedSteps) {
        for (const step of steps.value) {
          if (!step.required) step.enabled = invitedStepEnabled(step.key, invitedSteps);
        }
      }
    },
    { immediate: true },
  );

  /*
   * The preview is fetched by landing on it.
   *
   * It used to be asked for by whichever function moved the page, and each of
   * those had to work out where it had just landed. The quick route's guess was
   * wrong, so the preview stayed empty and Apply was still enabled: a button
   * offering to write a list of nothing.
   */
  watch(page, async (current) => {
    if (current === 'review') await setup.refreshPlan();
  });

  /*
   * OBS can arrive while the preview is on screen.
   *
   * Somebody who clicks through the installer with this dialog open leaves a
   * preview behind that still says OBS is not installed, and it is not wrong
   * about what it knew, only about now.
   */
  watch(
    () => status.value?.installed,
    async (installed) => {
      if (installed && page.value === 'review') await setup.refreshPlan();
    },
  );

  const blocked = computed(() => isPlanBlocked(plan.value));

  /*
   * A blocker can stop being true while it is on screen.
   *
   * "OBS is open" is the one that matters: the whole preview refuses to write
   * while OBS is running, so the natural thing to do is close OBS, and then
   * nothing happened. The message sat there until the user went back a page and
   * returned, which reads as the app not noticing rather than as a stale read.
   *
   * So while the preview is showing something that blocks it, ask again. Only
   * while it is showing, and only while it is blocked: a preview with nothing in
   * its way has no reason to keep asking.
   */
  let recheckingPlan: ReturnType<typeof setInterval> | null = null;

  function stopRecheckingPlan(): void {
    if (recheckingPlan) clearInterval(recheckingPlan);
    recheckingPlan = null;
  }

  watch(
    () => page.value === 'review' && toValue(options.open) && blocked.value,
    (shouldWatch) => {
      stopRecheckingPlan();
      if (!shouldWatch) return;

      recheckingPlan = setInterval(() => {
        void setup.refreshPlan();
      }, 2000);
    },
  );

  const closingObs = ref(false);

  /**
   * Close OBS, so the preview can stop refusing.
   *
   * `CloseMainWindow`, the same as clicking the X, so OBS saves its own settings
   * on the way out and the replay buffer is stopped rather than dropped. It can
   * fail honestly: OBS asks before exiting while an output is running, and that
   * dialog belongs to the user. The poll on the plan then clears the blocker by
   * itself once it has gone.
   */
  async function askObsToClose(): Promise<void> {
    closingObs.value = true;
    try {
      const result = await window.goodbit?.closeObs();

      if (!result?.closed && result?.reason === 'no-window') {
        // No window, no tray icon, nothing to click. Say so, and offer the only
        // thing that works rather than asking them to find a window that is not
        // there.
        confirmAction(
          'OBS is running with no window open, so there is nothing to close. GoodBit can end it. Nothing is lost: it writes its settings when it exits normally, and GoodBit is about to write them anyway.',
          () => void endObs(),
          'OBS has no window',
        );
        return;
      }

      if (!result?.closed) {
        toast.error(
          'OBS asks before closing while the replay buffer is running. Answer that, and this clears itself.',
          'OBS is still open',
        );
        return;
      }

      await setup.refreshPlan();
    } finally {
      closingObs.value = false;
    }
  }

  /** The second half of `askObsToClose`, once the user has agreed to end it. */
  async function endObs(): Promise<void> {
    closingObs.value = true;
    try {
      const result = await window.goodbit?.closeObs(true);
      if (result?.closed) {
        toast.success('OBS has been closed');
        await setup.refreshPlan();
      } else {
        toast.error('Ending OBS did not work. Task Manager will do it.', 'OBS is still open');
      }
    } finally {
      closingObs.value = false;
    }
  }

  const tiles = computed(() =>
    quickSummaryTiles({
      display: display.value,
      bufferSeconds: bufferSeconds.value,
      hotkey: hotkey.value,
      audio: audio.value,
      audioIds: audioIds.value,
    }),
  );

  /** A switch by the key it drives, so each page shows only its own. */
  const sceneStep = computed(() => steps.value.find((step) => step.key === 'createScene') ?? null);
  const desktopStep = computed(
    () => steps.value.find((step) => step.key === 'captureDesktop') ?? null,
  );
  const bufferStep = computed(
    () => steps.value.find((step) => step.key === 'enableReplayBuffer') ?? null,
  );
  const hotkeyStep = computed(() => steps.value.find((step) => step.key === 'bindHotkey') ?? null);

  /** The only writer of `step.enabled`, so a step page can stay a prop away. */
  function setStepEnabled(key: SetupStep['key'], enabled: boolean): void {
    const step = steps.value.find((candidate) => candidate.key === key);
    if (step) step.enabled = enabled;
  }

  function choose(which: ObsSetupRoute): void {
    route.value = which;
    if (which === 'quick') setup.useDefaults();
    at.value = 1;
  }

  async function install(method: 'winget' | 'download' | 'manual'): Promise<void> {
    if (method === 'manual') {
      void window.goodbit?.openExternal(
        setup.installPlan.value?.downloadPage ?? 'https://obsproject.com/download',
      );
      return;
    }

    installing.value = true;
    try {
      await setup.install(method);
    } finally {
      installing.value = false;
      installProgress.value = null;
    }
  }

  async function next(): Promise<void> {
    const last = pages.value.length - 1;

    if (page.value === 'review') {
      const ok = await setup.apply();
      if (ok) at.value = Math.min(at.value + 1, last);
      return;
    }

    at.value = Math.min(at.value + 1, last);
  }

  function back(): void {
    if (at.value > 0) at.value -= 1;
  }

  async function startObs(): Promise<void> {
    waitingForClip.value = true;
    const started = await setup.start();
    if (!started) waitingForClip.value = false;
  }

  /** Whether the forward button refuses, on the page it is refusing on. */
  const forwardDisabled = computed(() =>
    continueDisabled({
      page: page.value,
      working: setup.working.value,
      plan: plan.value,
      installed: Boolean(status.value?.installed),
    }),
  );

  return {
    route,
    at,
    pages,
    page,
    showEverything,
    waitingForClip,
    firstClip,
    installing,
    installProgress,
    blocked,
    closingObs,
    tiles,
    sceneStep,
    desktopStep,
    bufferStep,
    hotkeyStep,
    forwardDisabled,
    setStepEnabled,
    askObsToClose,
    choose,
    install,
    next,
    back,
    startObs,
  };
}
