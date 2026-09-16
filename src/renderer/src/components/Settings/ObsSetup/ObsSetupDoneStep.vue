<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import AppLoading from '../../App/AppLoading.vue';
import { readableHotkey } from '../../../utils/obsSetupWizard';

/**
 * Proof that it works.
 *
 * The last page is not a receipt, it is a test: GoodBit starts OBS with its own
 * profile and the buffer running, and then waits for the library watcher to see
 * a file. That is the whole chain, OBS to staging to attribution to a row, and
 * it costs nothing to listen for because the watcher is already running.
 */

interface Props {
  /** What was written, as `applyObsSetup` reported it. */
  result: string[] | null;
  hotkey: string;
  firstClip: { game: string } | null;
  waiting: boolean;
}

interface Emits {
  (e: 'start'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const readableKey = computed(() => readableHotkey(props.hotkey));
</script>

<template>
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

    <div v-else-if="waiting" class="flex items-center gap-2 text-sm text-muted-500">
      <AppLoading class="text-lg" />
      <span>Waiting for your first clip…</span>
    </div>

    <button
      v-else
      class="px-4 py-2 rounded-lg border border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 text-sm font-medium text-foreground"
      @click="emit('start')"
    >
      Start OBS and wait for a clip
    </button>
  </div>
</template>
