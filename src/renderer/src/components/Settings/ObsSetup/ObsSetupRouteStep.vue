<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { ObsSetupRoute } from '../../../utils/obsSetupWizard';

/**
 * The first question: how much of this do you want to be asked?
 *
 * Almost everybody wants the same thing: the main screen, thirty seconds, a
 * key, the system's sound, clips in folders. **Quick** does that and shows the
 * changes. **Step by step** asks about each of them for the people who have a
 * second monitor, a voice chat on its own device, or an opinion about hotkeys.
 *
 * Both end at the same preview, because nothing is written until it has been
 * seen.
 */

interface Emits {
  (e: 'choose', route: ObsSetupRoute): void;
}

const emit = defineEmits<Emits>();
</script>

<!--
  No wrapping element, here or in any of the step components. The dialog's body
  is `space-y-3`, which spaces its own direct children, so a wrapper would
  collapse every card in a step into one child and lose the gaps between them.
-->
<template>
  <button
    class="w-full text-left p-4 rounded-xl border border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 transition-colors"
    @click="emit('choose', 'quick')"
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
    @click="emit('choose', 'full')"
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
