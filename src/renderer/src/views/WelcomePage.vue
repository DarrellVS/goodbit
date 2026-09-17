<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import BaseToggle from '@renderer/components/Base/BaseToggle.vue';
import Wordmark from '@renderer/components/Shell/Wordmark.vue';
import ObsSetupDialog from '@renderer/components/Settings/ObsSetupDialog.vue';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import { useObsSetup } from '@renderer/composables/obs/useObsSetup';

/**
 * First run, as the steps it actually takes.
 *
 * It used to be one screen with a folder picker on it, which was honest about
 * what the app needed and silent about what it is for. GoodBit does not record
 * anything: OBS does, and GoodBit keeps what OBS records. Someone arriving
 * without OBS, or with an OBS that writes every clip into one folder, has an
 * empty library and no way to know why.
 *
 * So the wizard walks the seam: install OBS if it is missing, point both at
 * the same folder, set up the recording, and finish. Every step past the
 * folder can be skipped, and each one says what happens if it is.
 */
const router = useRouter();
const { settings, load, save, pickFolder } = useAppSettings();
const setup = useObsSetup();
const { status, installPlan, working: setupWorking, error: setupError } = setup;

const step = ref(0);
const working = ref(false);
const installing = ref(false);
const installMessage = ref<string | null>(null);
const progress = ref<{ percent?: number; message: string } | null>(null);
const showSetupDialog = ref(false);

let detach: (() => void) | null = null;

onMounted(async () => {
  await load();
  await setup.refresh();
  if (!status.value?.installed) await setup.loadInstallPlan();

  detach =
    window.goodbit?.onServiceEvent((raw) => {
      const event = raw as { type: string; stage?: string; percent?: number; message?: string };
      if (event.type !== 'obs-setup-progress') return;
      progress.value =
        event.stage === 'done' || event.stage === 'failed'
          ? null
          : { percent: event.percent, message: event.message ?? '' };
    }) ?? null;
});

onBeforeUnmount(() => detach?.());

/**
 * The steps, and which of them this machine needs.
 *
 * Installing OBS only appears when there is no OBS, because a step that says
 * "you already have this" is a step that teaches people to click past steps.
 */
const steps = computed(() => {
  const list = [
    { id: 'intro', label: 'What this is' },
    { id: 'folder', label: 'Your clips folder' },
  ];
  if (status.value && !status.value.installed) list.push({ id: 'obs', label: 'Install OBS' });
  list.push({ id: 'recording', label: 'Recording' }, { id: 'finish', label: 'Done' });
  return list;
});

const current = computed(() => steps.value[Math.min(step.value, steps.value.length - 1)]);
const canContinue = computed(() => {
  if (current.value.id === 'folder') return Boolean(settings.value.videosRoot);
  return true;
});

function next(): void {
  if (step.value < steps.value.length - 1) step.value += 1;
}

function back(): void {
  if (step.value > 0) step.value -= 1;
}

async function chooseVideos(): Promise<void> {
  working.value = true;
  try {
    await pickFolder('videosRoot', 'Where should OBS save your clips?');
    await setup.refresh();
  } finally {
    working.value = false;
  }
}

async function chooseMusic(): Promise<void> {
  working.value = true;
  try {
    await pickFolder('audioRoot', 'Where is your music?');
  } finally {
    working.value = false;
  }
}

async function install(method: 'winget' | 'download' | 'manual'): Promise<void> {
  if (method === 'manual') {
    void window.goodbit?.openExternal(installPlan.value?.downloadPage ?? 'https://obsproject.com/download');
    return;
  }

  installing.value = true;
  try {
    installMessage.value = await setup.install(method);
    await setup.refresh();
  } catch {
    // The message is on screen; the manual route is still there.
  } finally {
    installing.value = false;
    progress.value = null;
  }
}

async function finish(): Promise<void> {
  if (!settings.value.videosRoot) return;
  await save({ startAtLogin: settings.value.startAtLogin });
  await router.push('/');
}
</script>

<template>
  <div class="h-full overflow-auto flex items-center justify-center p-8">
    <div class="w-full max-w-lg space-y-7">
      <div class="text-center space-y-3">
        <Wordmark :size="56" class="mx-auto" />
        <h1 class="text-2xl font-bold text-foreground">Welcome to GoodBit</h1>
      </div>

      <!-- Where you are, which also says how short this is. -->
      <ol class="flex items-center gap-1.5">
        <li
          v-for="(entry, index) in steps"
          :key="entry.id"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="index <= step ? 'bg-orange-500' : 'bg-muted-100'"
          :title="entry.label"
        ></li>
      </ol>

      <!-- 1. What this is -->
      <section v-if="current.id === 'intro'" class="space-y-4">
        <p class="text-foreground">
          GoodBit is a companion to OBS. <strong>OBS records</strong>, and presses your last thirty
          seconds into a file when you hit a key. <strong>GoodBit keeps them</strong>: it watches
          that folder, sorts what lands there by game, finds the loud part, and lets you cut it down
          and share it.
        </p>
        <p class="text-sm text-muted-500">
          The next couple of steps point the two at each other. You can change any of it later in
          Settings.
        </p>
      </section>

      <!-- 2. The folder both programs agree on -->
      <section v-else-if="current.id === 'folder'" class="space-y-3">
        <p class="text-sm text-muted-500">
          One folder, used by both: OBS writes clips into it, GoodBit watches it. A folder per game
          appears inside it as you play.
        </p>

        <button
          class="w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors"
          :class="settings.videosRoot
            ? 'border-orange-400 bg-orange-500/5'
            : 'border-border bg-card hover:bg-muted-50'"
          :disabled="working"
          @click="chooseVideos"
        >
          <Icon
            :icon="settings.videosRoot ? 'material-symbols:check-circle' : 'material-symbols:folder-open'"
            class="text-2xl shrink-0"
            :class="settings.videosRoot ? 'text-orange-500' : 'text-muted-400'"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-foreground">Your clips folder</span>
            <span class="block text-xs text-muted-500 truncate">
              {{ settings.videosRoot || 'Required: choose a folder' }}
            </span>
          </span>
        </button>

        <button
          class="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted-50 text-left transition-colors"
          :disabled="working"
          @click="chooseMusic"
        >
          <Icon icon="material-symbols:music-note" class="text-2xl text-muted-400 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-foreground">Music for the editor</span>
            <span class="block text-xs text-muted-500 truncate">
              {{ settings.audioRoot || 'Optional. You can set this later' }}
            </span>
          </span>
        </button>
      </section>

      <!-- 3. Only when there is no OBS -->
      <section v-else-if="current.id === 'obs'" class="space-y-4">
        <p class="text-foreground">OBS is not on this machine yet.</p>
        <p class="text-sm text-muted-500">
          It is free, open source, and the thing that does the actual recording. GoodBit can fetch it
          for you, or you can install it yourself and come back.
        </p>

        <div v-if="progress" class="space-y-1">
          <p class="text-sm text-muted-500">{{ progress.message }}</p>
          <div v-if="progress.percent !== undefined" class="h-1 bg-muted-100 rounded-sm overflow-hidden">
            <div
              class="h-full bg-orange-500 transition-[width] duration-200"
              :style="{ width: `${progress.percent}%` }"
            ></div>
          </div>
        </div>

        <p v-if="installMessage" class="text-sm text-foreground">{{ installMessage }}</p>
        <p v-if="setupError" class="text-sm text-red-500">{{ setupError }}</p>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in installPlan?.options ?? []"
            :key="option.method"
            class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            :class="
              option.method === 'winget'
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
          {{ Math.round(installPlan.installer.bytes / 1_000_000) }} MB, from the OBS project's own
          release.
        </p>
      </section>

      <!-- 4. The recording setup itself -->
      <section v-else-if="current.id === 'recording'" class="space-y-4">
        <template v-if="status?.installed">
          <p class="text-foreground">
            {{
              status.ready
                ? 'OBS is already set up to record into your library.'
                : 'Now the recording itself.'
            }}
          </p>
          <p class="text-sm text-muted-500">
            GoodBit can turn on the replay buffer, bind a key, and install the script that puts each
            clip in a folder named after the game you were playing. It makes its own OBS profile and
            leaves yours alone, and it shows you every line it would write before it writes any.
          </p>

          <button
            class="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-40"
            :disabled="setupWorking"
            @click="showSetupDialog = true"
          >
            {{ status.ready ? 'Review the setup' : 'Set up OBS for me' }}
          </button>

          <p class="text-xs text-muted-500 text-center">
            Skip it and GoodBit still indexes whatever OBS already writes.
          </p>
        </template>

        <template v-else>
          <p class="text-foreground">OBS still is not here.</p>
          <p class="text-sm text-muted-500">
            Once it is installed, Settings, Recording has the same setup waiting.
          </p>
        </template>
      </section>

      <!-- 5. Done -->
      <section v-else class="space-y-4">
        <p class="text-foreground">That is everything.</p>
        <p class="text-sm text-muted-500">
          New clips appear on their own while GoodBit runs in the tray. Press its hotkey in a game
          and it will be here by the time you alt-tab.
        </p>

        <div class="flex items-start gap-3 p-4 rounded-xl bg-muted-50">
          <BaseToggle
            class="mt-0.5"
            label="Start with Windows"
            :model-value="settings.startAtLogin"
            @update:model-value="save({ startAtLogin: $event })"
          />
          <span class="text-sm">
            <span class="block font-medium text-foreground">Start with Windows</span>
            <span class="block text-xs text-muted-500">
              Runs quietly in the tray so new clips are indexed as they are recorded
            </span>
          </span>
        </div>
      </section>

      <div class="flex items-center gap-2">
        <button
          v-if="step > 0"
          class="px-4 py-3 rounded-xl border border-border text-sm text-foreground"
          @click="back"
        >
          Back
        </button>

        <button
          v-if="current.id !== 'finish'"
          class="flex-1 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:hover:bg-orange-500 transition-colors"
          :disabled="!canContinue"
          @click="next"
        >
          {{ canContinue ? 'Continue' : 'Choose your clips folder first' }}
        </button>

        <button
          v-else
          class="flex-1 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
          @click="finish"
        >
          Start using GoodBit
        </button>
      </div>
    </div>

    <ObsSetupDialog v-model:open="showSetupDialog" @done="setup.refresh()" />
  </div>
</template>
