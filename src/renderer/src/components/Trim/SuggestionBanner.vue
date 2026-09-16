<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import AppMark from '../App/AppMark.vue';
import type { ClipSuggestions } from '../../services/clips';

interface Props {
  suggestions: ClipSuggestions | null;
  loading: boolean;
  /** True once the range already matches the suggestion, so the button can say so. */
  applied: boolean;
  /**
   * Whether this game's clips get their screen read as well as heard. Known
   * before the answer arrives, so the wait can say what is taking the time.
   */
  watchesScreen?: boolean;
}

interface Emits {
  (e: 'apply', start: number, end: number): void;
  (e: 'seek', time: number): void;
  (e: 'reject'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/**
 * Nothing is shown unless the analysis is sure.
 *
 * Most clips have nothing to point at, a flat-sounding clip returns
 * `confident: false`, and a suggestion that is really a guess would teach the
 * user to ignore the banner entirely.
 */
const show = computed(() => !!props.suggestions?.confident && !!props.suggestions.window);

/**
 * Whether this row has anything in it at all.
 *
 * The row itself is always in the layout, and only its height changes. It used
 * to appear while listening and then vanish when there was nothing worth
 * saying, and since the video above is `flex-1` it snapped forty pixels taller
 * at that moment: the picture jumped, which read as the video loading late
 * rather than as a banner leaving.
 */
const occupied = computed(() => props.loading || show.value);

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

/**
 * What the game itself showed, when it showed anything.
 *
 * Loudness can only report that a clip got loud, so its banner says so in
 * general terms. A kill banner is the game confirming what happened, and then
 * the suggestion can say why it is being made.
 */
const evidence = computed(() => props.suggestions?.evidence ?? null);

const headline = computed(() =>
  evidence.value ? `Worth keeping: ${label.value}` : `The loudest stretch is ${label.value}`,
);

const detail = computed(() =>
  evidence.value
    ? evidence.value
    : `${seconds.value}s, which is usually where the good bit is`,
);

const seconds = computed(() => {
  const w = window.value;
  return w ? Math.round((w.end - w.start) * 10) / 10 : 0;
});

/**
 * Saying the suggestion is wrong is the only thing the app cannot work out for
 * itself. A trim records where you cut; ignoring a banner records nothing.
 */
const dismissed = ref(false);

function reject(): void {
  dismissed.value = true;
  emit('reject');
}
</script>

<template>
  <!--
    A row that is always here and sometimes has nothing in it.

    `grid-template-rows` from `0fr` to `1fr` is the one way to animate to and
    from a height nobody knows in advance, which is the case here: the answer is
    one line, two on a narrow window. The child needs `overflow-hidden` and
    `min-h-0` or it refuses to be squeezed.
  -->
  <div
    class="grid transition-[grid-template-rows] duration-300 ease-out"
    :class="occupied ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
  >
    <div class="overflow-hidden min-h-0">
      <!--
        The answer replaces the wait rather than cutting over it. Both states are
        one line of the same height, so `out-in` crossfades without the box
        resizing under it.
      -->
      <Transition name="settle" mode="out-in">
  <div
    v-if="loading"
    key="listening"
    class="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card/60 text-sm text-muted-500"
  >
    <Icon
      :icon="watchesScreen ? 'material-symbols:screenshot-monitor' : 'material-symbols:graphic-eq'"
      class="text-base animate-pulse"
    />
    <!--
      Reading the screen takes a few seconds where listening takes a tenth of
      one, so the wait says which is happening rather than looking stuck.
    -->
    {{ watchesScreen ? 'Listening, and reading this game’s HUD…' : 'Listening to this clip…' }}
  </div>

  <div
    v-else-if="show && window"
    key="answer"
    class="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl border border-orange-300 bg-orange-500/6"
  >
    <!--
      The app's own mark when the game told us what happened, a level meter when
      all we did was listen. `material-symbols:crosshair` is not a real icon
      name, so this was a blank space.
    -->
    <AppMark v-if="evidence" bare :size="20" class="text-orange-500" />
    <Icon v-else icon="material-symbols:graphic-eq" class="text-lg text-orange-500 flex-shrink-0" />

    <div class="text-sm text-muted-800 min-w-0">
      <span class="font-semibold">{{ headline }}</span>
      <span class="text-muted-500">, {{ detail }}</span>
    </div>

    <div class="flex items-center gap-1.5 ml-auto">
      <button
        v-for="moment in suggestions?.moments ?? []"
        :key="moment.t"
        class="text-[11px] font-mono px-1.5 py-0.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-500/16 transition-colors"
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

      <button
        class="text-xs px-2 py-1.5 rounded-lg text-muted-500 hover:text-muted-800 hover:bg-black/5 transition-colors disabled:opacity-40"
        :disabled="dismissed"
        :title="dismissed ? 'Noted' : 'Tell GoodBit this suggestion is wrong'"
        @click="reject"
      >
        {{ dismissed ? 'Noted' : 'Wrong' }}
      </button>
    </div>
  </div>
      </Transition>
    </div>
  </div>
</template>
