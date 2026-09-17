<script setup lang="ts">
import { computed } from 'vue';
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import ObsSetupStepToggle from './ObsSetupStepToggle.vue';
import type { ComboBoxOption, ComboBoxValue } from '@renderer/components/Base/types';
import type { SetupStep } from '@renderer/composables/obs/useObsSetup';
import type { CaptureDisplay } from '@renderer/services/obs';

/**
 * The screen, which decides resolution and colour.
 *
 * It has to be asked. OBS fills a new profile with 1920x1080 at 30, so a setup
 * that says nothing records an ultrawide letterboxed at half its resolution,
 * and nobody notices until they watch a clip back. Whether this screen is in
 * HDR mode decides the colour format, and a mismatch there is what makes the
 * replay buffer refuse to start.
 *
 * A `BaseComboBox`, like every other dropdown in the app. It could not be one
 * at first: the component portalled its list at `z-50` while this dialog's
 * scrim is `z-100` in the same stacking context, so the list landed behind
 * the scrim and clicking an option hit the scrim, which closes the wizard. The
 * component now opens above every dialog in the app, see its own note.
 */

interface Props {
  displays: CaptureDisplay[];
  displayId: number | null;
  /** The screen currently chosen, which is what the summary describes. */
  display: CaptureDisplay | null;
  desktopStep: SetupStep | null;
  sceneStep: SetupStep | null;
}

interface Emits {
  (e: 'update:displayId', value: number | null): void;
  (e: 'toggle-step', key: SetupStep['key'], enabled: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/**
 * Written through a computed so the select can keep `v-model.number`.
 *
 * Vue's own `.number` handling is what turned the option's value into a number
 * before this page was split up, and reproducing it by hand on a `@change` is a
 * second answer to a question that already has one.
 */
/*
 * `ComboBoxValue`, not `number | null`.
 *
 * `BaseComboBox` emits the option's own value, which here is a display id and
 * therefore a number. The cast on the way out is the one place that has to be
 * stated, because the component's contract is deliberately `string | number`
 * so it can carry both kinds of list.
 */
const chosen = computed<ComboBoxValue | null>({
  get: () => props.displayId,
  set: (value) => emit('update:displayId', value === null ? null : Number(value)),
});

/** One line per screen: the label, its resolution, and which one is the main. */
const screenOptions = computed<ComboBoxOption[]>(() =>
  props.displays.map((screen) => ({
    value: screen.id,
    label: `${screen.label} · ${screen.width}x${screen.height}${
      screen.primary ? ' (main)' : ''
    }`,
  })),
);
</script>

<template>
  <label v-if="displays.length" class="p-4 rounded-md border border-border block">
    <span class="block text-xs text-muted-500 mb-1.5">Record this screen</span>
    <BaseComboBox
      v-model="chosen"
      label="Record this screen"
      class="w-full"
      :options="screenOptions"
    />
  </label>

  <div v-if="display" class="p-4 rounded-md border border-border">
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
        class="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold tracking-wide bg-accent/15 text-accent-ink border border-accent/30"
      >
        HDR
      </span>
    </div>
    <p class="text-xs text-muted-500 mt-1">Recorded at full size, not scaled down.</p>
  </div>

  <ObsSetupStepToggle
    v-if="desktopStep"
    :step="desktopStep"
    @update:enabled="emit('toggle-step', 'captureDesktop', $event)"
  />

  <ObsSetupStepToggle
    v-if="sceneStep"
    :step="sceneStep"
    @update:enabled="emit('toggle-step', 'createScene', $event)"
  />
</template>
