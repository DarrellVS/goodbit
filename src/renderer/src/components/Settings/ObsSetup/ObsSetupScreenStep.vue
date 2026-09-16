<script setup lang="ts">
import { computed } from 'vue';
import ObsSetupStepToggle from './ObsSetupStepToggle.vue';
import type { SetupStep } from '../../../composables/useObsSetup';
import type { CaptureDisplay } from '../../../services/obs';

/**
 * The screen, which decides resolution and colour.
 *
 * It has to be asked. OBS fills a new profile with 1920x1080 at 30, so a setup
 * that says nothing records an ultrawide letterboxed at half its resolution,
 * and nobody notices until they watch a clip back. Whether this screen is in
 * HDR mode decides the colour format, and a mismatch there is what makes the
 * replay buffer refuse to start.
 *
 * **Still a native `<select>`, and it has to be.** `Base/BaseComboBox.vue` is
 * the app's one dropdown now, and this and the hotkey picker are the two places
 * it cannot go yet: its list is portalled to `document.body` at `z-50`, and
 * this dialog's scrim is `z-[100]` in the same stacking context, so the list
 * lands behind the scrim and a click on an option hits the scrim instead, which
 * closes the wizard. Measured in a browser against the real numbers. A native
 * select's popup is drawn by Windows and is not in the page's stacking context
 * at all, which is why nobody has noticed. The component needs the affordance
 * `Base/BaseDialog.vue` already has, a way for a caller to raise its content.
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
const chosen = computed<number | null>({
  get: () => props.displayId,
  set: (value) => emit('update:displayId', value),
});
</script>

<template>
  <label v-if="displays.length" class="p-4 rounded-xl border border-border block">
    <span class="block text-xs text-muted-500 mb-1.5">Record this screen</span>
    <select
      v-model.number="chosen"
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
