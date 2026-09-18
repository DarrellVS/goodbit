<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import ObsSetupDialog from './ObsSetupDialog.vue';
import ClipsFolderCard from './ClipsFolderCard.vue';
import {
  BUTTON,
  BUTTON_STRONG,
  ICON_BOX,
} from '@renderer/components/Base/geometry';
import SettingToggle from './SettingToggle.vue';
import SettingSelect from './SettingSelect.vue';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import { useObsSetup } from '@renderer/composables/obs/useObsSetup';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import { useToastStore } from '@renderer/stores/toast';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

/**
 * Recording: the OBS half of the app, and where what it records lands.
 *
 * GoodBit is a companion to OBS. OBS records, this keeps what was recorded, and
 * until the two are pointed at each other the library is an empty folder with a
 * picker on it. Everything here is about that seam, and the first thing it does
 * is say plainly which part of it is wrong.
 *
 * The clips folder moved on to this page from a section called App, because it
 * is the other end of the same seam: OBS writes into it and GoodBit reads it,
 * and they are one setting rather than two that can disagree. So did the two
 * startup switches, which exist so that GoodBit is up and indexing while
 * somebody is playing, and running the setup again, which walks exactly this
 * page from the beginning.
 */
const setup = useObsSetup();
const { status, loading, working } = setup;
const toast = useToastStore();
const router = useRouter();
const { settings, load: loadSettings, save: saveSettings } = useAppSettings();
/* The cards here carry their own name from `utils/settingsCatalog.ts`. */
const { settingRing } = useSettingsSearch();

/**
 * Walk through the first run again.
 *
 * It is the only place that puts the whole thing in order: what GoodBit is,
 * the folder, OBS if it is missing, and the recording setup. Someone who
 * skipped a step on day one, or changed their monitor, or reads it once and
 * wants to change one answer, would otherwise have to remember which settings
 * screen each piece lives on. Which is why it is on this page rather than under
 * Advanced: every step of it is a thing on this page.
 *
 * Nothing is reset by going there. Every step shows what is already set and
 * changes only what is answered.
 */
function runOnboarding(): void {
  void router.push({ name: 'welcome' });
}

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
  confirmAction(
    'The GoodBit profile and scene collection go, and the one setting GoodBit changed outside them goes back to what it was. Your own profiles and scenes are untouched. Close OBS first.',
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
  <section>
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Recording</h2>
      <p class="mt-2 text-muted-500">
        OBS, your clips folder, and what happens when you press the key
      </p>
    </div>

    <div
      data-setting="OBS setup"
      :class="['setting-card', settingRing('OBS setup')]"
    >
      <!--
        A dot and a sentence, which is how Connections says the same kind of
        thing two pages along. It was a 20px glyph in the success green beside
        a heading, so the loudest thing in the section was the news that
        nothing needs doing.
      -->
      <div class="flex items-center gap-2">
        <BaseSpinner v-if="!status" class="size-3.5 shrink-0 block text-muted-400" />
        <span
          v-else
          class="size-1.5 rounded-full shrink-0"
          :class="status.ready ? 'bg-success' : 'bg-accent'"
        />
        <h3>{{ headline }}</h3>
      </div>
      <p>{{ subhead }}</p>

      <!--
        One way in, installed or not.

        This used to show its own install buttons when OBS was missing, which
        meant the setup itself could not be reached from the one screen that
        says it is missing. The wizard installs OBS as its first step now, so
        the button is the same button either way.
      -->
      <template v-if="status">
        <!--
          What is wrong, as rows rather than as a stack of tinted boxes.

          A blocker keeps a colour, because it is the one thing here that
          stops the feature working at all; it is a dot and the ink, not a
          filled panel. A warning is just a row: it is a remark, and a box
          around a remark makes it look like a failure.
        -->
        <ul v-if="blockers.length || warnings.length" class="mt-4">
          <li
            v-for="finding in [...blockers, ...warnings]"
            :key="finding.id"
            class="flex items-start gap-2.5 py-3 border-t border-border"
          >
            <span
              class="size-1.5 rounded-full shrink-0 mt-2"
              :class="finding.level === 'blocker' ? 'bg-danger' : 'bg-muted-300'"
            />
            <div class="min-w-0">
              <p class="text-sm font-medium text-foreground">{{ finding.title }}</p>
              <p class="text-sm text-muted-500 mt-0.5 max-w-[76ch]">{{ finding.detail }}</p>
            </div>
          </li>
        </ul>

        <div class="flex flex-wrap items-center gap-2 mt-4">
          <button
            type="button"
            :class="BUTTON_STRONG"
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

          <button v-if="status.ready" type="button" :class="BUTTON" @click="launch">
            {{ status.running ? 'OBS is running' : 'Start OBS' }}
          </button>

          <button
            type="button"
            class="ml-auto inline-flex items-center gap-1.5 text-sm text-accent-ink hover:text-foreground outline-none focus-visible:focus-ring rounded-xs transition-colors duration-150"
            @click="openGuide"
          >
            <Icon icon="material-symbols:open-in-new" :class="ICON_BOX" />
            Rather do it by hand?
          </button>
        </div>

        <p v-if="status.setupWrittenAt" class="text-sm text-muted-400 mt-3 max-w-[76ch]">
          GoodBit last wrote to OBS on
          {{ new Date(status.setupWrittenAt).toLocaleDateString() }}. Your other profiles were not
          touched.
          <!--
            Nothing here is one-way. Undo removes the files GoodBit created and
            restores the one key it changed in a file it did not, from the
            backup it took at the time.
          -->
          <button
            type="button"
            class="ml-1 text-accent-ink hover:text-foreground outline-none focus-visible:focus-ring rounded-xs transition-colors duration-150"
            @click="undo"
          >
            Undo that
          </button>
        </p>
      </template>
    </div>

    <div
      data-setting="Run the setup again"
      :class="['setting-card', settingRing('Run the setup again')]"
    >
      <h3>Run the setup again</h3>
      <p>
        The first run, from the start: your clips folder, OBS if it is missing, and the recording
        setup. Nothing is reset, and every step shows what is already set.
      </p>
      <div class="mt-4">
        <button type="button" :class="BUTTON" @click="runOnboarding">Start it</button>
      </div>
    </div>

    <ClipsFolderCard />

    <!--
      Three switches about being up while somebody is playing, which is one
      story: OBS running with its buffer on, GoodBit running to file what it
      saves, and GoodBit staying up after the window is closed. The last two
      were under App and read as housekeeping rather than as the reason the
      replay key works at all.

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

    <SettingToggle
      label="Start with Windows"
      description="Runs in the tray and indexes clips as they are recorded"
      :model-value="settings.startAtLogin"
      @update:model-value="saveSettings({ startAtLogin: $event })"
    />

    <SettingToggle
      label="Keep running when the window closes"
      description="Off means closing the window quits, and nothing is indexed until you open it again"
      :model-value="settings.keepRunningInTray"
      @update:model-value="saveSettings({ keepRunningInTray: $event })"
    />

    <!--
      One feature, one heading.

      This was five bordered boxes stacked in a row, then a card with the rows
      flush inside it and hand-cut dividers between them, which made a group of
      five dependent settings a frame of its own inside a page that has no other
      frames. It is a heading and five ordinary rows now, so the hairlines line
      up with everything above and below, and the `v-if`s already say which ones
      depend on which.
    -->
    <h3 class="setting-subhead">Saying a clip was saved</h3>

    <!--
      Pressing the replay key and getting nothing back is the most uncertain
      moment in using this app: OBS says nothing useful, its window is behind
      a game, and the clip takes a few seconds to reach the library. This is
      the receipt, and it appears only once the clip is actually indexed, so
      it cannot say "saved" about a buffer that was not running.
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

      <!--
        Loudness is the one thing the app cannot work out for itself: the
        chime plays over a game, so the right level depends on how loud that
        game is and how the machine is mixed. Fixed, it was too quiet to hear
        over anything.
      -->
      <div
        v-if="settings.clipToastSound !== false"
        data-setting="How loud"
        :class="['setting-block flex items-start justify-between gap-6', settingRing('How loud')]"
      >
        <div class="min-w-0 flex-1">
          <label class="text-sm font-medium text-foreground">How loud</label>
          <p class="text-sm text-muted-500 mt-0.5 max-w-[62ch]">
            Press Show me after changing it, to hear where it lands
          </p>
        </div>
        <div class="flex items-center gap-3 shrink-0 mt-0.5">
          <input
            :value="settings.clipToastVolume ?? 75"
            type="range"
            min="0"
            max="100"
            step="5"
            class="w-40"
            aria-label="Chime volume"
            @change="saveSettings({ clipToastVolume: Number(($event.target as HTMLInputElement).value) })"
          />
          <span class="w-10 text-right font-mono text-xs tabular-nums text-muted-400">
            {{ settings.clipToastVolume ?? 75 }}%
          </span>
        </div>
      </div>

      <SettingSelect
        label="Where it appears"
        description="On whichever screen your pointer is on, which is the one you are playing on."
        :model-value="settings.clipToastCorner ?? 'top-right'"
        :options="CORNERS"
        @update:model-value="saveSettings({ clipToastCorner: $event as never })"
      />

      <!--
        A row like the rest, because it was a bare button with two sentences
        of prose wrapped around it, which read as a paragraph that happened to
        contain a button.
      -->
      <div
        data-setting="Try it"
        :class="['setting-block flex items-start justify-between gap-6', settingRing('Try it')]"
      >
        <div class="min-w-0 flex-1">
          <label class="text-sm font-medium text-foreground">Try it</label>
          <p class="text-sm text-muted-500 mt-0.5 max-w-[62ch]">
            Shows the card and plays the chime, without recording anything
          </p>
        </div>
        <button type="button" :class="[BUTTON, 'shrink-0']" @click="previewToast">
          Show me
        </button>
      </div>

      <!-- The one thing that can make this look broken, said once and quietly. -->
      <p class="setting-block !border-b-0 text-sm text-muted-400 max-w-[76ch]">
        Nothing can draw over a game in exclusive fullscreen. Borderless windowed, which most
        games default to, is fine.
      </p>
    </template>

    <ObsSetupDialog
      v-model:open="showDialog"
      :direct-to-full="changingExisting"
      @done="setup.refresh()"
    />
  </section>
</template>
