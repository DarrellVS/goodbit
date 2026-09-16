<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import ObsSetupDialog from './ObsSetupDialog.vue';
import SettingToggle from './SettingToggle.vue';
import SettingSelect from './SettingSelect.vue';
import { useAppSettings } from '../../composables/useAppSettings';
import { useObsSetup } from '../../composables/useObsSetup';
import { useToastStore } from '../../stores/toast';

/**
 * Recording: the OBS half of the app.
 *
 * GoodBit is a companion to OBS. OBS records, this keeps what was recorded, and
 * until the two are pointed at each other the library is an empty folder with a
 * picker on it. Everything here is about that seam, and the first thing it does
 * is say plainly which part of it is wrong.
 */
const setup = useObsSetup();
const { status, loading, working } = setup;
const toast = useToastStore();
const { settings, load: loadSettings, save: saveSettings } = useAppSettings();

const CORNERS = [
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
];

/** Draws the real overlay, with the real corner and the real sound. */
function previewToast(): void {
  void window.goodbit?.previewClipToast();
}

const showDialog = ref(false);

/*
 * Changing a setup and making one are different jobs.
 *
 * The quick route answers every question with a default, which is what
 * somebody with no setup wants and exactly what somebody adjusting a working
 * one does not: it would quietly replace the audio devices and the screen they
 * already chose. So a working setup goes straight to the questions.
 */
const changingExisting = ref(false);

function openSetup(): void {
  changingExisting.value = status.value?.ready === true;
  showDialog.value = true;
}

const GUIDE = 'https://darrellvs.github.io/goodbit/obs.html';

onMounted(async () => {
  await Promise.all([setup.refresh(), loadSettings()]);
});

const headline = computed(() => {
  const current = status.value;
  if (!current) return 'Checking OBS…';
  if (!current.installed) return 'OBS is not installed yet';
  if (current.ready) return 'OBS is set up and recording into your library';
  return 'OBS is not set up for GoodBit yet';
});

const subhead = computed(() => {
  const current = status.value;
  if (!current) return '';
  if (!current.installed) {
    return 'GoodBit keeps the clips OBS records. Without OBS there is nothing to keep.';
  }
  if (current.ready) {
    return `Profile ${current.activeProfileName}, ${current.hotkey ?? 'no key'} saves the last ${current.replayBufferSeconds ?? '?'} seconds.`;
  }
  return 'One or two settings are in the way. Each one below says which.';
});

const blockers = computed(() => status.value?.findings.filter((f) => f.level === 'blocker') ?? []);
const warnings = computed(() => status.value?.findings.filter((f) => f.level === 'warning') ?? []);

async function launch(): Promise<void> {
  try {
    const started = await setup.start({ minimized: true });
    toast.success(started ? 'OBS is running with the buffer on' : 'OBS did not start');
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : 'Please try again.', 'Could not start OBS');
  }
}

function undo(): void {
  toast.confirm(
    'The GoodBit profile and scene collection go, and the Python path goes back to what it was. Your own profiles and scenes are untouched. Close OBS first.',
    async () => {
      await setup.undo();
      toast.success('OBS is back to how it was');
    },
    'Undo the OBS setup?',
  );
}

function openGuide(): void {
  void window.goodbit?.openExternal(GUIDE);
}

</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Recording</h2>
      <p class="text-sm text-muted-500">How OBS and GoodBit fit together</p>
    </div>

    <div class="p-4 bg-card rounded-lg border border-border space-y-4">
      <div class="flex items-start gap-3">
        <Icon
          :icon="
            !status
              ? 'material-symbols:progress-activity'
              : status.ready
                ? 'material-symbols:check-circle'
                : 'material-symbols:error-circle-rounded'
          "
          class="text-xl flex-shrink-0 mt-0.5"
          :class="[
            !status ? 'text-muted-400 animate-spin' : status.ready ? 'text-emerald-500' : 'text-orange-500',
          ]"
        />
        <div class="min-w-0">
          <p class="font-medium text-foreground">{{ headline }}</p>
          <p class="text-sm text-muted-500 mt-0.5">{{ subhead }}</p>
        </div>
      </div>

      <!--
        One way in, installed or not.

        This used to show its own install buttons when OBS was missing, which
        meant the setup itself could not be reached from the one screen that
        says it is missing. The wizard installs OBS as its first step now, so
        the button is the same button either way.
      -->
      <template v-if="status">
        <ul v-if="blockers.length || warnings.length" class="space-y-2">
          <li
            v-for="finding in [...blockers, ...warnings]"
            :key="finding.id"
            class="flex items-start gap-2.5 p-3 rounded-xl border"
            :class="
              finding.level === 'blocker'
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-border bg-muted-50'
            "
          >
            <Icon
              :icon="
                finding.level === 'blocker'
                  ? 'material-symbols:block'
                  : 'material-symbols:info-outline'
              "
              class="text-base flex-shrink-0 mt-0.5"
              :class="finding.level === 'blocker' ? 'text-red-500' : 'text-muted-400'"
            />
            <div class="min-w-0">
              <p class="text-sm font-medium text-foreground">{{ finding.title }}</p>
              <p class="text-xs text-muted-500 mt-0.5">{{ finding.detail }}</p>
            </div>
          </li>
        </ul>

        <div class="flex flex-wrap items-center gap-2">
          <button
            class="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium disabled:opacity-50"
            :disabled="loading || working"
            @click="openSetup"
          >
            {{
              !status.installed
                ? 'Install OBS and set it up'
                : status.ready
                  ? 'Change the setup'
                  : 'Set up OBS for me'
            }}
          </button>

          <button
            v-if="status.ready"
            class="px-4 py-2 rounded-lg border border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 text-sm font-medium text-foreground"
            @click="launch"
          >
            {{ status.running ? 'OBS is running' : 'Start OBS' }}
          </button>

          <button
            class="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-500 ml-auto"
            @click="openGuide"
          >
            <Icon icon="material-symbols:open-in-new" class="text-base" />
            Rather do it by hand?
          </button>
        </div>

        <p v-if="status.setupWrittenAt" class="text-xs text-muted-500">
          GoodBit last wrote to OBS on
          {{ new Date(status.setupWrittenAt).toLocaleDateString() }}. Your other profiles were not
          touched.
          <!--
            Nothing here is one-way. Undo removes the files GoodBit created and
            restores the one key it changed in a file it did not, from the
            backup it took at the time.
          -->
          <button class="text-orange-600 hover:text-orange-500 ml-1" @click="undo">
            Undo that
          </button>
        </p>
      </template>
    </div>

    <!--
      The whole point is that the last thirty seconds are always there, which
      is only true while OBS is running with its buffer on.
    -->
    <SettingToggle
      v-if="status?.installed"
      label="Start OBS with GoodBit"
      description="Minimised, with the replay buffer running, so your key works after a restart without opening anything."
      :model-value="settings.startObsWithGoodbit === true"
      @update:model-value="saveSettings({ startObsWithGoodbit: $event })"
    />

    <!--
      Pressing the replay key and getting nothing back is the most uncertain
      moment in using this app: OBS says nothing useful, its window is behind a
      game, and the clip takes a few seconds to reach the library. This is the
      receipt, and it appears only once the clip is actually indexed, so it
      cannot say "saved" about a buffer that was not running.
    -->
    <SettingToggle
      label="Say when a clip is saved"
      description="A small card over the game for a few seconds, once the clip is filed and in your library. It never takes focus and clicks pass straight through it."
      :model-value="settings.clipToast !== false"
      @update:model-value="saveSettings({ clipToast: $event })"
    />

    <template v-if="settings.clipToast !== false">
      <SettingToggle
        label="Play a sound with it"
        description="Two short notes. Separate from the card, since a noise and a picture are different amounts of interruption."
        :model-value="settings.clipToastSound !== false"
        @update:model-value="saveSettings({ clipToastSound: $event })"
      />

      <SettingSelect
        label="Where it appears"
        description="On whichever screen your pointer is on, which is the one you are playing on."
        :model-value="settings.clipToastCorner ?? 'top-right'"
        :options="CORNERS"
        @update:model-value="saveSettings({ clipToastCorner: $event as never })"
      />

      <div class="flex items-start gap-3">
        <button
          class="px-3 py-2 rounded-lg border border-border text-sm text-muted-700 font-medium hover:bg-muted-50 transition-colors"
          @click="previewToast"
        >
          Show me
        </button>
        <p class="text-xs text-muted-500 pt-2.5">
          A corner and a chime are worth judging rather than guessing.
          <span class="block">
            A game in exclusive fullscreen owns the screen outright and nothing can draw over it;
            borderless windowed, which most games default to, is fine.
          </span>
        </p>
      </div>
    </template>

    <ObsSetupDialog
      v-model:open="showDialog"
      :direct-to-full="changingExisting"
      @done="setup.refresh()"
    />
  </section>
</template>
