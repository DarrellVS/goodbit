<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BaseToggle from '../Base/BaseToggle.vue';
import { useObsSetup } from '../../composables/useObsSetup';
import { skipObsWizard } from '../../services/obs';
import { useToastStore } from '../../stores/toast';
import AppLoading from '../App/AppLoading.vue';

/**
 * The setup, by one of two routes.
 *
 * Almost everybody wants the same thing: the main screen, thirty seconds, a
 * key, the system's sound, clips in folders. **Quick** does that and shows the
 * changes. **Step by step** asks about each of them for the people who have a
 * second monitor, a voice chat on its own device, or an opinion about
 * hotkeys.
 *
 * Both end at the same preview, because nothing is written until it has been
 * seen: this edits another program's configuration, and the honest version of
 * that is showing the edit.
 */

interface Props {
  open: boolean;
  /**
   * What the website's guide asked for, when the dialog was opened by a link.
   *
   * Choices only. A link cannot name a folder, cannot carry a secret and
   * cannot apply anything: it ticks boxes, and a person still reads the list
   * of changes and presses the button.
   */
  invitedSteps?: string[] | null;
  invitedBuffer?: number | null;
  invitedHotkey?: string | null;
  /**
   * Skip the quick-or-thorough question and go straight to the questions.
   *
   * Changing a setup that already works is not the same job as making one.
   * The quick route exists to get somebody recording without asking anything,
   * and offering it to a person who came here specifically to change a setting
   * is offering to overwrite their answers with the defaults.
   */
  directToFull?: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'done'): void;
}

const props = withDefaults(defineProps<Props>(), {
  invitedSteps: null,
  invitedBuffer: null,
  invitedHotkey: null,
  directToFull: false,
});
const emit = defineEmits<Emits>();

const setup = useObsSetup();
const toast = useToastStore();
const {
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
  working,
  error,
  result,
} = setup;

/**
 * The pages, in order.
 *
 * `install` only appears on a machine with no OBS, because the setup cannot do
 * anything without it and sending somebody away to a download page is where
 * most people stop.
 */
const ALL_PAGES = [
  { id: 'route', title: 'Set up OBS' },
  { id: 'install', title: 'Install OBS' },
  { id: 'screen', title: 'What to record' },
  { id: 'recording', title: 'When to save it' },
  { id: 'audio', title: 'What to hear' },
  { id: 'sorting', title: 'Where clips land' },
  { id: 'review', title: 'What changes' },
  { id: 'done', title: 'Try it' },
] as const;

type PageId = (typeof ALL_PAGES)[number]['id'];

/** Quick skips the questions; both routes keep the preview. */
const route = ref<'quick' | 'full'>('full');

const pages = computed(() => {
  const needsInstall = status.value ? !status.value.installed : false;
  // Annotated: without it TypeScript infers a type predicate from the branches
  // and narrows 'route' and 'install' out of PageId entirely.
  return ALL_PAGES.filter((page): boolean => {
    // Removed rather than stepped over, so Back cannot land on a question
    // that was never asked and the step count reads honestly.
    if (page.id === 'route') return !props.directToFull;
    if (page.id === 'install') return needsInstall;
    // Route is decided above, so by here it is one of the question pages.
    if (route.value === 'quick') return page.id === 'review' || page.id === 'done';
    return true;
  });
});

const at = ref(0);
const page = computed<PageId>(() => pages.value[Math.min(at.value, pages.value.length - 1)]?.id ?? 'route');

/** Keys people actually bind a replay to. */
const HOTKEYS = ['OBS_KEY_F8', 'OBS_KEY_F9', 'OBS_KEY_F10', 'OBS_KEY_F12'];

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
  () => page.value === 'install' && props.open,
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
  () => props.open,
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

    if (props.invitedBuffer) bufferSeconds.value = props.invitedBuffer;
    if (props.invitedHotkey) hotkey.value = props.invitedHotkey;

    if (props.invitedSteps) {
      const asked = new Set(props.invitedSteps);
      const names: Record<string, string> = {
        createProfile: 'profile',
        enableReplayBuffer: 'buffer',
        bindHotkey: 'hotkey',
        createScene: 'scene',
        captureDesktop: 'desktop',
      };
      for (const step of steps.value) {
        if (!step.required) step.enabled = asked.has(names[step.key] ?? '');
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

/** A switch by the key it drives, so each page shows only its own. */
const sceneStep = computed(() => steps.value.find((step) => step.key === 'createScene') ?? null);
const desktopStep = computed(() => steps.value.find((step) => step.key === 'captureDesktop') ?? null);
const bufferStep = computed(() => steps.value.find((step) => step.key === 'enableReplayBuffer') ?? null);
const hotkeyStep = computed(() => steps.value.find((step) => step.key === 'bindHotkey') ?? null);

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
      toast.confirm(
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

const blocked = computed(() => (plan.value?.blockers.length ?? 0) > 0);

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
  () => page.value === 'review' && props.open && blocked.value,
  (shouldWatch) => {
    stopRecheckingPlan();
    if (!shouldWatch) return;

    recheckingPlan = setInterval(() => {
      void setup.refreshPlan();
    }, 2000);
  },
);

/**
 * The quick route's answer, at a glance.
 *
 * The full preview is a list of every file and key, which is the right thing
 * for somebody who chose to walk the steps and the wrong thing for somebody
 * who pressed the button that means "you decide". Same information, one line
 * each, with the whole list a click away underneath.
 */
const tiles = computed(() => {
  const chosen = audioIds.value.length;
  const audioLabel =
    chosen === 0
      ? 'None, clips will be silent'
      : chosen === 1
        ? (audio.value.find((device) => device.id === audioIds.value[0])?.name ?? 'One device')
        : `${chosen} devices, each on its own fader`;

  return [
    {
      icon: 'material-symbols:monitor',
      label: 'Recording',
      value: display.value
        ? `${display.value.width} by ${display.value.height}, ${
            display.value.frequency >= 60 ? 60 : display.value.frequency
          } fps`
        : 'Your main screen',
      badge: display.value?.hdrEnabled ? 'HDR' : null,
    },
    {
      icon: 'material-symbols:keyboard',
      label: 'Saving',
      value: `The last ${bufferSeconds.value} seconds, on ${readableKey.value}`,
      badge: null,
    },
    {
      icon: 'material-symbols:volume-up',
      label: 'Sound',
      value: audioLabel,
      badge: null,
    },
    {
      icon: 'material-symbols:folder',
      label: 'Clips',
      value: 'A folder per game',
      badge: null,
    },
  ];
});
const readableKey = computed(() => hotkey.value.replace('OBS_KEY_', ''));

function toggleAudio(id: string): void {
  const chosen = new Set(audioIds.value);
  if (chosen.has(id)) chosen.delete(id);
  else chosen.add(id);
  audioIds.value = [...chosen];
}

const outputs = computed(() => audio.value.filter((device) => device.flow === 'output'));
const inputs = computed(() => audio.value.filter((device) => device.flow === 'input'));

function choose(which: 'quick' | 'full'): void {
  route.value = which;
  if (which === 'quick') setup.useDefaults();
  at.value = 1;
}

async function install(method: 'winget' | 'download' | 'manual'): Promise<void> {
  if (method === 'manual') {
    void window.goodbit?.openExternal(
      installPlan.value?.downloadPage ?? 'https://obsproject.com/download',
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

function close(): void {
  emit('update:open', false);
  emit('done');
}

/**
 * Leaving, with somewhere to come back to.
 *
 * Walking out of this is a fine thing to do, and somebody who does it should
 * not be left wondering whether they have just permanently declined the only
 * offer. Settings has the same wizard behind a button, and saying so costs one
 * sentence.
 */
function notNow(): void {
  toast.confirm(
    'Settings, Recording has this waiting whenever you want it, and Advanced can replay the whole first run.',
    () => close(),
    'Leave the setup for now?',
  );
}

function openLink(url: string): void {
  void window.goodbit?.openExternal(url);
}
</script>

<template>
  <!--
    Above the floating toolbars, which are z-50 and were drawing over this.
  -->
  <div
    v-if="open"
    data-testid="obs-setup"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6"
    @click.self="close"
  >
    <div class="w-full max-w-2xl max-h-full flex flex-col bg-card rounded-2xl border border-border shadow-2xl">
      <header class="flex items-start justify-between gap-4 p-5 pb-3 flex-shrink-0">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-foreground">{{ pages[at]?.title ?? 'Set up OBS' }}</h2>
          <p v-if="page !== 'route'" class="text-sm text-muted-500 mt-0.5">
            Step {{ at + 1 }} of {{ pages.length }}
          </p>
          <p v-else class="text-sm text-muted-500 mt-0.5">
            GoodBit keeps the clips OBS records. This is the part in between.
          </p>
        </div>
        <button class="p-1.5 rounded-lg hover:bg-muted-100 text-muted-500" @click="close">
          <Icon icon="material-symbols:close" class="text-xl" />
        </button>
      </header>

      <ol v-if="page !== 'route'" class="flex items-center gap-1.5 px-5 pb-4 flex-shrink-0">
        <li
          v-for="(entry, index) in pages"
          :key="entry.id"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="index <= at ? 'bg-orange-500' : 'bg-muted-100'"
          :title="entry.title"
        ></li>
      </ol>
      <div v-else class="pb-1"></div>

      <div class="px-5 pb-5 space-y-3 overflow-y-auto">
        <!-- 0. Which way -->
        <template v-if="page === 'route'">
          <button
            class="w-full text-left p-4 rounded-xl border border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 transition-colors"
            @click="choose('quick')"
          >
            <span class="flex items-center gap-2">
              <Icon icon="material-symbols:bolt" class="text-lg text-orange-500" />
              <span class="font-medium text-foreground">Quick setup</span>
            </span>
            <span class="block text-sm text-muted-500 mt-1">
              Your main screen, the last 30 seconds, F8 to save, your usual sound, clips sorted by
              game. You still see the list of changes before anything is written.
            </span>
          </button>

          <button
            class="w-full text-left p-4 rounded-xl border border-border hover:bg-muted-50 transition-colors"
            @click="choose('full')"
          >
            <span class="flex items-center gap-2">
              <Icon icon="material-symbols:tune" class="text-lg text-muted-400" />
              <span class="font-medium text-foreground">Step by step</span>
            </span>
            <span class="block text-sm text-muted-500 mt-1">
              Choose the screen, the length, the key and which audio devices to record. Worth it if
              you have two monitors or a separate voice chat device.
            </span>
          </button>
        </template>

        <!-- 1. No OBS, no clips -->
        <template v-else-if="page === 'install'">
          <p class="text-sm text-muted-500">
            OBS does the recording; GoodBit keeps what it records. It is free and open source, and
            this installs it from the OBS project's own release.
          </p>

          <div v-if="installProgress" class="p-4 rounded-xl border border-border space-y-2">
            <p class="text-sm text-muted-500">{{ installProgress.message }}</p>
            <div v-if="installProgress.percent !== undefined" class="h-1 bg-muted-100 rounded overflow-hidden">
              <div
                class="h-full bg-orange-500 transition-[width] duration-200"
                :style="{ width: `${installProgress.percent}%` }"
              ></div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <!-- The first option is the recommended one; see installOptions. -->
            <button
              v-for="(option, index) in installPlan?.options ?? []"
              :key="option.method"
              class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              :class="
                index === 0
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'border border-border hover:bg-muted-50 text-foreground'
              "
              :disabled="installing"
              :title="option.detail"
              @click="install(option.method)"
            >
              {{ installing && option.method !== 'manual' ? 'Working…' : option.label }}
            </button>
          </div>

          <p v-if="installPlan?.installer" class="text-xs text-muted-500">
            OBS {{ installPlan.installer.version }},
            {{ Math.round(installPlan.installer.bytes / 1_000_000) }} MB, the current release. It
            opens OBS's own installer, which asks its own questions.
          </p>

          <p v-if="!status?.installed" class="text-xs text-muted-500 flex items-center gap-1.5">
            <AppLoading class="text-sm" />
            Watching for OBS to appear. This carries on by itself once it is installed.
          </p>
          <p v-else class="text-xs text-emerald-500 flex items-center gap-1.5">
            <Icon icon="material-symbols:check-circle" class="text-sm" />
            OBS is here.
          </p>
          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        </template>

        <!-- 2. The screen, which decides resolution and colour -->
        <template v-else-if="page === 'screen'">
          <label v-if="displays.length" class="p-4 rounded-xl border border-border block">
            <span class="block text-xs text-muted-500 mb-1.5">Record this screen</span>
            <select
              v-model.number="displayId"
              class="w-full bg-muted-50 border border-border rounded-lg px-2.5 py-2 text-sm text-foreground"
            >
              <option v-for="screen in displays" :key="screen.id" :value="screen.id">
                {{ screen.label }} &middot; {{ screen.width }}x{{ screen.height }}{{
                  screen.primary ? ' (main)' : ''
                }}
              </option>
            </select>
          </label>

          <div v-if="display" class="p-4 rounded-xl border border-border">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-foreground font-medium text-sm">
                {{ display.width }}x{{ display.height }},
                {{ display.frequency >= 60 ? 60 : display.frequency }} fps
              </p>
              <!--
                A badge, not a paragraph. That this screen is in HDR mode is the
                whole of what a person needs to know; the reasons live in the
                code that acts on it.
              -->
              <span
                v-if="display.hdrEnabled"
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-orange-500/15 text-orange-500 border border-orange-500/30"
              >
                HDR
              </span>
            </div>
            <p class="text-xs text-muted-500 mt-1">Recorded at full size, not scaled down.</p>
          </div>

          <div
            v-if="desktopStep"
            class="p-4 rounded-xl border border-border flex items-start justify-between gap-4"
          >
            <div class="min-w-0">
              <p class="font-medium text-foreground text-sm">{{ desktopStep.label }}</p>
              <p class="text-xs text-muted-500 mt-1">{{ desktopStep.description }}</p>
            </div>
            <BaseToggle
              v-model="desktopStep.enabled"
              :label="desktopStep.label"
              class="flex-shrink-0"
            />
          </div>

          <div
            v-if="sceneStep"
            class="p-4 rounded-xl border border-border flex items-start justify-between gap-4"
          >
            <div class="min-w-0">
              <p class="font-medium text-foreground text-sm">{{ sceneStep.label }}</p>
              <p class="text-xs text-muted-500 mt-1">{{ sceneStep.description }}</p>
              <p v-if="sceneStep.advisedOff" class="text-xs text-orange-600 mt-1">
                {{ sceneStep.advisedOff }}
              </p>
            </div>
            <BaseToggle v-model="sceneStep.enabled" :label="sceneStep.label" class="flex-shrink-0" />
          </div>
        </template>

        <!-- 3. The buffer and the key -->
        <template v-else-if="page === 'recording'">
          <p class="text-sm text-muted-500">
            OBS keeps the last few seconds in memory and writes them to a file when you press a key.
            That is the whole loop: you press it after something happens, not before.
          </p>

          <div class="grid grid-cols-2 gap-3">
            <label class="p-4 rounded-xl border border-border block">
              <span class="block text-xs text-muted-500 mb-1.5">Keep the last</span>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="bufferSeconds"
                  type="number"
                  min="10"
                  max="300"
                  class="w-20 bg-muted-50 border border-border rounded-lg px-2.5 py-2 text-sm text-foreground tabular-nums"
                />
                <span class="text-sm text-foreground">seconds</span>
              </div>
            </label>

            <label class="p-4 rounded-xl border border-border block">
              <span class="block text-xs text-muted-500 mb-1.5">Save with</span>
              <select
                v-model="hotkey"
                class="w-full bg-muted-50 border border-border rounded-lg px-2.5 py-2 text-sm text-foreground"
              >
                <option v-for="key in HOTKEYS" :key="key" :value="key">
                  {{ key.replace('OBS_KEY_', '') }}
                </option>
              </select>
            </label>
          </div>

          <div
            v-if="bufferStep"
            class="p-4 rounded-xl border border-border flex items-start justify-between gap-4"
          >
            <div class="min-w-0">
              <p class="font-medium text-foreground text-sm">{{ bufferStep.label }}</p>
              <p class="text-xs text-muted-500 mt-1">{{ bufferStep.description }}</p>
            </div>
            <BaseToggle v-model="bufferStep.enabled" :label="bufferStep.label" class="flex-shrink-0" />
          </div>

          <div
            v-if="hotkeyStep"
            class="p-4 rounded-xl border border-border flex items-start justify-between gap-4"
          >
            <div class="min-w-0">
              <p class="font-medium text-foreground text-sm">{{ hotkeyStep.label }}</p>
              <!--
                Says what will happen, rather than what OBS happens to have now:
                "nothing is bound" next to a box reading F8 reads as a
                contradiction, which it was.
              -->
              <p class="text-xs text-muted-500 mt-1">
                {{ readableKey }} will save a replay.
                <template v-if="status?.hotkey">Your current profile uses {{ status.hotkey }}.</template>
                <template v-else>OBS has nothing bound at the moment.</template>
              </p>
            </div>
            <BaseToggle v-model="hotkeyStep.enabled" :label="hotkeyStep.label" class="flex-shrink-0" />
          </div>
        </template>

        <!-- 4. Audio -->
        <template v-else-if="page === 'audio'">
          <p class="text-sm text-muted-500">
            Each one becomes its own fader in OBS, so a game and a voice chat arrive as two tracks
            rather than one. The first is the right answer if you have never thought about this.
          </p>

          <div class="space-y-1.5">
            <p class="text-xs uppercase tracking-wide text-muted-500">Playing</p>
            <!--
              Two columns, because a machine with a capture card, a virtual
              mixer and a monitor's own speakers has a dozen of these and one
              column turns the step into a scroll.
            -->
            <div class="grid sm:grid-cols-2 gap-1.5">
            <button
              v-for="device in outputs"
              :key="device.id"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors"
              :class="
                audioIds.includes(device.id)
                  ? 'border-orange-500/50 bg-orange-500/5'
                  : 'border-border hover:bg-muted-50'
              "
              @click="toggleAudio(device.id)"
            >
              <Icon
                :icon="
                  audioIds.includes(device.id)
                    ? 'material-symbols:check-circle'
                    : 'material-symbols:circle-outline'
                "
                class="text-lg flex-shrink-0"
                :class="audioIds.includes(device.id) ? 'text-orange-500' : 'text-muted-400'"
              />
              <span class="min-w-0">
                <span class="block text-sm text-foreground truncate">{{ device.name }}</span>
                <!-- Three endpoints called Speakers are three devices. -->
                <span v-if="device.description" class="block text-xs text-muted-500 truncate">
                  {{ device.description }}
                </span>
              </span>
            </button>
            </div>
          </div>

          <div v-if="inputs.length" class="space-y-1.5 pt-1">
            <p class="text-xs uppercase tracking-wide text-muted-500">Microphones</p>
            <div class="grid sm:grid-cols-2 gap-1.5">
            <button
              v-for="device in inputs"
              :key="device.id"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors"
              :class="
                audioIds.includes(device.id)
                  ? 'border-orange-500/50 bg-orange-500/5'
                  : 'border-border hover:bg-muted-50'
              "
              @click="toggleAudio(device.id)"
            >
              <Icon
                :icon="
                  audioIds.includes(device.id)
                    ? 'material-symbols:check-circle'
                    : 'material-symbols:circle-outline'
                "
                class="text-lg flex-shrink-0"
                :class="audioIds.includes(device.id) ? 'text-orange-500' : 'text-muted-400'"
              />
              <span class="min-w-0">
                <span class="block text-sm text-foreground truncate">{{ device.name }}</span>
                <span v-if="device.description" class="block text-xs text-muted-500 truncate">
                  {{ device.description }}
                </span>
              </span>
            </button>
            </div>
          </div>

          <p v-if="!audioIds.length" class="text-xs text-orange-600">
            Nothing selected, so your clips will be silent.
          </p>
        </template>

        <!-- 5. Sorting, which is not optional -->
        <template v-else-if="page === 'sorting'">
          <p class="text-sm text-muted-500">
            GoodBit reads a folder per game, and that folder name is the game name. OBS names a
            recording after the clock and nothing else, so something has to decide which game a clip
            belongs to. GoodBit does it itself, with nothing to install.
          </p>

          <div class="p-4 rounded-xl border border-border flex items-start gap-3">
            <Icon
              icon="material-symbols:check-circle"
              class="text-lg text-orange-500 flex-shrink-0 mt-0.5"
            />
            <div class="min-w-0">
              <p class="font-medium text-foreground text-sm">A folder per game</p>
              <p class="text-xs text-muted-500 mt-1">
                Whatever you were playing when you press the key is what the clip is filed under. A
                browser or a launcher is named properly too, so nothing lands loose.
              </p>
            </div>
          </div>
        </template>

        <template v-else-if="page === 'review'">
          <!--
            Quick asked for a decision, not a reading. Four lines, and the
            whole list underneath for anybody who wants it.
          -->
          <template v-if="route === 'quick' && plan && plan.changes.length">
            <div class="grid sm:grid-cols-2 gap-2">
              <div
                v-for="tile in tiles"
                :key="tile.label"
                class="p-3 rounded-xl border border-border flex items-start gap-2.5"
              >
                <Icon :icon="tile.icon" class="text-base text-orange-500 flex-shrink-0 mt-0.5" />
                <div class="min-w-0">
                  <p class="text-xs text-muted-500">{{ tile.label }}</p>
                  <p class="text-sm text-foreground">
                    {{ tile.value }}
                    <span
                      v-if="tile.badge"
                      class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-orange-500/15 text-orange-500 border border-orange-500/30"
                    >
                      {{ tile.badge }}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <p class="text-xs text-muted-500">
              Into a profile and scene of its own. Yours are not touched.
            </p>
          </template>

          <div
            v-for="blocker in plan?.blockers ?? []"
            :key="blocker"
            class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-foreground"
          >
            <p>{{ blocker }}</p>

            <!--
              The one blocker with an answer the app can carry out.
              GoodBit starts OBS itself at boot, so "close it and try again"
              sends people round a loop: they close OBS, GoodBit opens it
              again the next time it starts, and the setup is blocked for a
              reason the app caused.
            -->
            <button
              v-if="blocker.toLowerCase().includes('obs is open')"
              class="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-medium disabled:opacity-60"
              :disabled="closingObs"
              @click="askObsToClose"
            >
              {{ closingObs ? 'Asking OBS to close…' : 'Close OBS for me' }}
            </button>
          </div>

          <button
            v-if="route === 'quick' && plan && plan.changes.length"
            class="text-xs text-muted-500 hover:text-foreground text-left"
            @click="showEverything = !showEverything"
          >
            {{ showEverything ? 'Hide the details' : 'Every file and key this changes' }}
          </button>

          <div
            v-for="change in plan?.changes ?? []"
            :key="change.file"
            v-show="route !== 'quick' || showEverything"
            class="rounded-xl border border-border overflow-hidden"
          >
            <div class="px-4 py-3 flex items-start gap-2.5 bg-muted-50">
              <Icon
                :icon="
                  change.kind === 'create'
                    ? 'material-symbols:add-circle'
                    : change.kind === 'download'
                      ? 'material-symbols:download'
                      : 'material-symbols:edit'
                "
                class="text-base text-orange-500 flex-shrink-0 mt-0.5"
              />
              <span class="text-sm font-medium text-foreground">{{ change.title }}</span>
            </div>

            <ul class="px-4 py-3 space-y-1.5">
              <li v-for="line in change.summary" :key="line" class="text-sm text-muted-500 flex gap-2">
                <span class="text-orange-500/60 flex-shrink-0">&middot;</span>
                <span>{{ line }}</span>
              </li>
            </ul>

            <details class="px-4 pb-3">
              <summary class="text-xs text-muted-500 cursor-pointer hover:text-foreground select-none">
                Exactly what gets written
              </summary>
              <p class="text-[11px] text-muted-500 font-mono break-all mt-2">{{ change.file }}</p>
              <div
                v-for="detail in change.details"
                :key="detail.key + detail.value"
                class="text-[11px] font-mono text-muted-500 flex gap-2 mt-0.5"
              >
                <span class="text-foreground">{{ detail.key }}</span>
                <span>=</span>
                <span class="text-orange-600 break-all">{{ detail.value }}</span>
                <span v-if="detail.was">(was {{ detail.was }})</span>
              </div>
            </details>
          </div>

          <div
            v-if="!plan"
            class="flex items-center gap-2 text-sm text-muted-500 py-4"
          >
            <AppLoading class="text-lg" />
            <span>Working out what would change…</span>
          </div>

          <p
            v-else-if="!plan.changes.length && !plan.blockers.length"
            class="text-sm text-muted-500 py-4"
          >
            Nothing to change: OBS already has everything this would set.
          </p>

          <!--
            Applying takes a moment, and most of it is somebody else's
            installer. A button that says "Writing…" for ninety seconds reads
            as a hang, so this says which part is happening.
          -->
          <div v-if="working" class="p-4 rounded-xl border border-orange-500/30 bg-orange-500/5 space-y-2">
            <div class="flex items-center gap-2 text-sm text-foreground">
              <AppLoading class="text-lg text-orange-500" />
              <span>{{ installProgress?.message ?? 'Writing the settings' }}</span>
            </div>
            <div
              v-if="installProgress?.percent !== undefined"
              class="h-1 bg-muted-100 rounded overflow-hidden"
            >
              <div
                class="h-full bg-orange-500 transition-[width] duration-200"
                :style="{ width: `${installProgress.percent}%` }"
              ></div>
            </div>
            <p class="text-xs text-muted-500">
              Downloading and installing OBS takes a minute the first time. It only happens once.
            </p>
          </div>

          <p
            v-for="note in plan?.notes ?? []"
            v-show="route !== 'quick' || showEverything"
            :key="note"
            class="text-xs text-muted-500"
          >
            {{ note }}
          </p>
          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        </template>

        <!-- 7. Proof that it works -->
        <template v-else>
          <div class="flex items-start gap-3">
            <Icon icon="material-symbols:check-circle" class="text-2xl text-emerald-500 flex-shrink-0" />
            <div>
              <p class="font-medium text-foreground">OBS is set up</p>
              <ul class="mt-1 space-y-0.5">
                <li v-for="line in result ?? []" :key="line" class="text-sm text-muted-500">
                  {{ line }}
                </li>
              </ul>
            </div>
          </div>

          <div class="p-4 rounded-xl border border-border space-y-3">
            <p class="text-sm text-foreground font-medium">Try it now</p>
            <p class="text-sm text-muted-500">
              GoodBit starts OBS with its own profile and the buffer running. Play something, press
              {{ readableKey }}, and the clip should appear here.
            </p>

            <div v-if="firstClip" class="flex items-center gap-2 text-sm text-emerald-500">
              <Icon icon="material-symbols:celebration" class="text-lg" />
              <span>{{ firstClip.game }} landed in your library. That is the whole loop working.</span>
            </div>

            <div v-else-if="waitingForClip" class="flex items-center gap-2 text-sm text-muted-500">
              <AppLoading class="text-lg" />
              <span>Waiting for your first clip…</span>
            </div>

            <button
              v-else
              class="px-4 py-2 rounded-lg border border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 text-sm font-medium text-foreground"
              @click="startObs"
            >
              Start OBS and wait for a clip
            </button>
          </div>
        </template>
      </div>

      <footer
        v-if="page !== 'route'"
        class="flex items-center justify-between gap-2 p-5 pt-3 border-t border-border flex-shrink-0"
      >
        <button
          v-if="at > 0 && page !== 'done'"
          class="px-4 py-2 rounded-lg border border-border text-sm text-foreground"
          @click="back"
        >
          Back
        </button>
        <span v-else></span>

        <div class="flex items-center gap-2">
          <button
            v-if="page !== 'done'"
            class="px-4 py-2 rounded-lg border border-border text-sm text-foreground"
            @click="notNow"
          >
            Not now
          </button>
          <button
            class="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium disabled:opacity-50"
            :disabled="
              working ||
              (page === 'review' && (blocked || !plan || !plan.changes.length)) ||
              (page === 'install' && !status?.installed)
            "
            @click="page === 'done' ? close() : next()"
          >
            <template v-if="page === 'review'">{{ working ? 'Writing…' : 'Apply' }}</template>
            <template v-else-if="page === 'done'">Done</template>
            <template v-else-if="page === 'install'">OBS is installed, continue</template>
            <template v-else>Continue</template>
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
