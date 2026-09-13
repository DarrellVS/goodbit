<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { ClipSuggestions } from '../../services/clips';

interface Props {
  suggestions: ClipSuggestions | null;
  loading: boolean;
  /** True once the range already matches the suggestion, so the button can say so. */
  applied: boolean;
}

interface Emits {
  (e: 'apply', start: number, end: number): void;
  (e: 'seek', time: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/**
 * Nothing is shown unless the analysis is sure.
 *
 * Most clips have nothing to point at — a flat-sounding clip returns
 * `confident: false` — and a suggestion that is really a guess would teach the
 * user to ignore the banner entirely.
 */
const show = computed(() => !!props.suggestions?.confident && !!props.suggestions.window);

const window = computed(() => props.suggestions?.window ?? null);

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const label = computed(() => {
  const w = window.value;
  return w ? `${format(w.start)} – ${format(w.end)}` : '';
});
</script>

<template>
  <div
    v-if="loading"
    class="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white/60 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400"
  >
    <Icon icon="material-symbols:graphic-eq" class="text-base animate-pulse" />
    Listening to this clip…
  </div>

  <div
    v-else-if="show && window"
    class="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl border border-orange-300 bg-orange-50/70"
  >
    <Icon icon="material-symbols:graphic-eq" class="text-lg text-orange-500 flex-shrink-0" />

    <div class="text-sm text-gray-800 min-w-0 dark:text-slate-200">
      <span class="font-semibold">The loudest stretch is {{ label }}</span>
      <span class="text-gray-500 dark:text-slate-400"> — that is usually where the good bit is</span>
    </div>

    <div class="flex items-center gap-1.5 ml-auto">
      <button
        v-for="moment in suggestions?.moments ?? []"
        :key="moment.t"
        class="text-[11px] font-mono px-1.5 py-0.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-100 transition-colors"
        :title="`Jump to ${format(moment.t)}`"
        @click="emit('seek', moment.t)"
      >
        {{ format(moment.t) }}
      </button>

      <button
        class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 transition-colors"
        :disabled="applied"
        @click="emit('apply', window.start, window.end)"
      >
        {{ applied ? 'Applied' : 'Use it' }}
      </button>
    </div>
  </div>
</template>
