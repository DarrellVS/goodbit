<script setup lang="ts">
import { computed } from 'vue';
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import ObsSetupStepToggle from './ObsSetupStepToggle.vue';
import type { ComboBoxOption } from '@renderer/components/Base/types';
import type { SetupStep } from '@renderer/composables/obs/useObsSetup';
import { OBS_HOTKEYS, readableHotkey } from '@renderer/utils/obsSetupWizard';
import {
  RECORDING_QUALITY_DESCRIPTIONS,
  RECORDING_QUALITY_LABELS,
  type RecordingQuality,
} from '@shared/index';

/**
 * How much to keep, and which key writes it out.
 *
 * The hotkey written here is the output's, `[Hotkeys] ReplayBuffer`, not the
 * frontend's: see `src/main/services/obs/`, which is where that cost a
 * debugging session.
 *
 * The key picker is a `BaseComboBox`, like every other dropdown in the app. It
 * could not be until the component learned to open above a dialog: see its own
 * note, and `ObsSetupScreenStep.vue`, which hit the same wall.
 */

interface Props {
  bufferSeconds: number;
  hotkey: string;
  /** What OBS has bound now, which is not the same thing as what this will bind. */
  currentHotkey: string | null;
  bufferStep: SetupStep | null;
  hotkeyStep: SetupStep | null;
  quality: RecordingQuality;
}

interface Emits {
  (e: 'update:bufferSeconds', value: number): void;
  (e: 'update:hotkey', value: string): void;
  (e: 'update:quality', value: RecordingQuality): void;
  (e: 'toggle-step', key: SetupStep['key'], enabled: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/**
 * Written through computeds so the controls can keep their own `v-model`.
 *
 * Vue's `.number` handling is what turned the field's string into a number
 * before this page was split up, and reproducing it by hand on an `@input` is
 * a second answer to a question that already has one.
 */
const seconds = computed<number>({
  get: () => props.bufferSeconds,
  set: (value) => emit('update:bufferSeconds', value),
});

/** The keys OBS will take, each written the way its own hotkey list shows it. */
const hotkeyOptions = computed<ComboBoxOption[]>(() =>
  OBS_HOTKEYS.map((candidate) => ({ value: candidate, label: readableHotkey(candidate) })),
);

const key = computed<string>({
  get: () => props.hotkey,
  set: (value) => emit('update:hotkey', value),
});

const readableKey = computed(() => readableHotkey(props.hotkey));

/**
 * How hard OBS compresses the recording.
 *
 * Asked here rather than left to Settings because it is the one answer on this
 * page that cannot be given retroactively: everything else on this screen can
 * be changed tonight and every clip already recorded is fine, and this one is
 * baked into the file. Two of OBS's four values; `Stream` is a bitrate for an
 * uplink that does not exist here and `Lossless` turns the replay buffer off,
 * which is the only way clips are made. See
 * `shared/constants/obsRecordingQuality.ts`.
 */
const qualityOptions: ComboBoxOption[] = (
  ['balanced', 'indistinguishable'] as RecordingQuality[]
).map((value) => ({
  value,
  label: RECORDING_QUALITY_LABELS[value],
  description: RECORDING_QUALITY_DESCRIPTIONS[value],
}));

const recordingQuality = computed<RecordingQuality>({
  get: () => props.quality,
  set: (value) => emit('update:quality', value),
});
</script>

<template>
  <p class="text-sm text-muted-500">
    OBS keeps the last few seconds in memory and writes them to a file when you press a key.
    That is the whole loop: you press it after something happens, not before.
  </p>

  <div class="grid grid-cols-2 gap-3">
    <label class="p-4 rounded-md border border-border block">
      <span class="block text-xs text-muted-500 mb-1.5">Keep the last</span>
      <div class="flex items-center gap-2">
        <input
          v-model.number="seconds"
          type="number"
          min="10"
          max="300"
          class="w-20 bg-muted-50 border border-border rounded-lg px-2.5 py-2 text-sm text-foreground tabular-nums"
        />
        <span class="text-sm text-foreground">seconds</span>
      </div>
    </label>

    <label class="p-4 rounded-md border border-border block">
      <span class="block text-xs text-muted-500 mb-1.5">Save with</span>
      <BaseComboBox v-model="key" label="Save with" class="w-full" :options="hotkeyOptions" />
    </label>
  </div>

  <label class="p-4 rounded-md border border-border block">
    <span class="block text-xs text-muted-500 mb-1.5">Recording quality</span>
    <BaseComboBox
      v-model="recordingQuality"
      label="Recording quality"
      class="w-full"
      :options="qualityOptions"
    />
    <span class="block text-xs text-muted-500 mt-2">
      Baked into the file. Unlike everything else here, it cannot be put right later.
    </span>
  </label>

  <ObsSetupStepToggle
    v-if="bufferStep"
    :step="bufferStep"
    @update:enabled="emit('toggle-step', 'enableReplayBuffer', $event)"
  />

  <ObsSetupStepToggle
    v-if="hotkeyStep"
    :step="hotkeyStep"
    @update:enabled="emit('toggle-step', 'bindHotkey', $event)"
  >
    <!--
      Says what will happen, rather than what OBS happens to have now:
      "nothing is bound" next to a box reading F8 reads as a
      contradiction, which it was.
    -->
    {{ readableKey }} will save a replay.
    <template v-if="currentHotkey">Your current profile uses {{ currentHotkey }}.</template>
    <template v-else>OBS has nothing bound at the moment.</template>
  </ObsSetupStepToggle>
</template>
