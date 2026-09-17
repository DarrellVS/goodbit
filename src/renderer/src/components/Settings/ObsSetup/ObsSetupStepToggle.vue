<script setup lang="ts">
import BaseToggle from '@renderer/components/Base/BaseToggle.vue';
import type { SetupStep } from '@renderer/composables/obs/useObsSetup';

/**
 * One thing the setup would do, and whether to do it.
 *
 * Four of these were written out longhand across two pages of the wizard, and
 * the only difference between them was which step they read. The switch is
 * `Base/BaseToggle.vue`, because there is one switch in this app.
 *
 * The step is read, never written: `useObsSetupWizard.setStepEnabled` is the
 * only writer of `step.enabled`, so a page can stay a prop away from the array
 * the request is built from.
 *
 * The slot is for the one step that says something other than its own
 * description: the hotkey page says what *will* happen rather than what OBS
 * happens to have now.
 */

interface Props {
  step: SetupStep;
}

interface Emits {
  (e: 'update:enabled', value: boolean): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="p-4 rounded-xl border border-border flex items-start justify-between gap-4">
    <div class="min-w-0">
      <p class="font-medium text-foreground text-sm">{{ step.label }}</p>
      <p class="text-xs text-muted-500 mt-1">
        <slot>{{ step.description }}</slot>
      </p>
      <!-- Off because it would be wrong here, not because the user said so. -->
      <p v-if="step.advisedOff" class="text-xs text-accent-ink mt-1">
        {{ step.advisedOff }}
      </p>
    </div>
    <BaseToggle
      :model-value="step.enabled"
      :label="step.label"
      class="shrink-0"
      @update:model-value="emit('update:enabled', $event)"
    />
  </div>
</template>
