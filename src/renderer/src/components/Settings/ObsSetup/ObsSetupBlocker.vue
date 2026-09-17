<script setup lang="ts">
import { computed } from 'vue';
import { isObsOpenBlocker } from '@renderer/utils/obsSetupWizard';

/**
 * A reason the plan cannot be applied.
 *
 * This is not advice. `src/main/services/obs/` writes nothing while OBS runs,
 * because it parses `basic.ini` once and rewrites the whole file from memory at
 * every save point, so an edit made underneath it is discarded. The forward
 * button refuses while any of these is here: see `continueDisabled`.
 */

interface Props {
  blocker: string;
  /** A close has been asked for and has not come back yet. */
  closing: boolean;
}

interface Emits {
  (e: 'close-obs'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/*
 * The one blocker with an answer the app can carry out.
 *
 * GoodBit starts OBS itself at boot, so "close it and try again" sends people
 * round a loop: they close OBS, GoodBit opens it again the next time it starts,
 * and the setup is blocked for a reason the app caused.
 */
const canClose = computed(() => isObsOpenBlocker(props.blocker));
</script>

<template>
  <div class="p-3 rounded-xl bg-danger/10 border border-danger/30 text-sm text-foreground">
    <p>{{ blocker }}</p>

    <button
      v-if="canClose"
      class="mt-2 px-3 py-1.5 rounded-lg bg-danger/20 hover:bg-danger/30 border border-danger/40 text-xs font-medium disabled:opacity-60"
      :disabled="closing"
      @click="emit('close-obs')"
    >
      {{ closing ? 'Asking OBS to close…' : 'Close OBS for me' }}
    </button>
  </div>
</template>
