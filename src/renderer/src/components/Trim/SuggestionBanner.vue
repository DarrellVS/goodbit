<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import Wordmark from '@renderer/components/Shell/Wordmark.vue';
import { momentCovered } from '@renderer/utils/goodBits';
import type { ClipSuggestions, SuggestionEvent } from '@renderer/services/clips';
import type { GoodBit } from '@renderer/types/goodbit';

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
  /**
   * What is already marked on this clip, so a reading that has been kept can
   * say so instead of offering to keep it twice.
   */
  goodBits?: readonly GoodBit[];
}

interface Emits {
  (e: 'apply', start: number, end: number): void;
  (e: 'seek', time: number): void;
  (e: 'reject'): void;
  /** Keep this reading as a GoodBit, in one press. */
  (e: 'keep', anchor: SuggestionEvent): void;
}

const props = withDefaults(defineProps<Props>(), { goodBits: () => [] });
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
 * Every reading confident enough to stand on its own, best first.
 *
 * **Not the same thing as `goodBits`**, which is where inside the suggested
 * window the sound peaked, and which this banner has always drawn as jump
 * chips. An anchor is something the game itself put on screen, with a sentence
 * saying what, and `decide()` used to keep the strongest and throw the rest
 * away: eight found moments across a real library, discarded.
 *
 * They are only worth a row of their own when there is more than one. With a
 * single anchor the headline above already names it and *Use it* already puts
 * the handles on it, so a chip repeating it is a second control for one
 * decision.
 */
const anchors = computed<SuggestionEvent[]>(() => {
  const found = props.suggestions?.anchors ?? [];
  return found.length > 1 ? [...found].sort((a, b) => a.atSec - b.atSec) : [];
});

/** The window the server placed, which belongs to the strongest reading only. */
const strongest = computed(() => props.suggestions?.anchors?.[0] ?? null);

function keptAlready(anchor: SuggestionEvent): boolean {
  return momentCovered(anchor.atSec, props.goodBits);
}

/**
 * One press keeps it, and moves the player to it.
 *
 * The seek is not decoration. Keeping a reading writes a row that is then only
 * visible as a band on a strip, and taking on trust that the app marked the
 * right two seconds is exactly the thing this feature should not ask for. The
 * player goes there so what was kept is on screen.
 */
function keep(anchor: SuggestionEvent): void {
  emit('seek', anchor.atSec);
  emit('keep', anchor);
}

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
    class="px-4 py-2.5 rounded-xl border border-accent bg-accent/6 space-y-2"
  >
    <div class="flex flex-wrap items-center gap-3">
    <!--
      The app's own mark when the game told us what happened, a level meter when
      all we did was listen. `material-symbols:crosshair` is not a real icon
      name, so this was a blank space.
    -->
    <Wordmark v-if="evidence" bare :size="20" class="text-accent-ink" />
    <Icon v-else icon="material-symbols:graphic-eq" class="text-lg text-accent-ink shrink-0" />

    <div class="text-sm text-muted-800 min-w-0">
      <span class="font-semibold">{{ headline }}</span>
      <span class="text-muted-500">, {{ detail }}</span>
    </div>

    <div class="flex items-center gap-1.5 ml-auto">
      <button
        v-for="goodBit in suggestions?.goodBits ?? []"
        :key="goodBit.t"
        class="text-[11px] font-mono px-1.5 py-0.5 rounded-sm border border-accent text-accent-ink hover:bg-accent/16 transition-colors"
        :title="`Jump to ${format(goodBit.t)}`"
        @click="emit('seek', goodBit.t)"
      >
        {{ format(goodBit.t) }}
      </button>

      <button
        class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent transition-colors"
        :disabled="applied"
        @click="emit('apply', window.start, window.end)"
      >
        {{ applied ? 'Applied' : 'Use it' }}
      </button>

      <button
        class="text-xs px-2 py-1.5 rounded-lg text-muted-500 hover:text-muted-800 hover:bg-muted-100 transition-colors disabled:opacity-40"
        :disabled="dismissed"
        :title="dismissed ? 'Noted' : 'Tell GoodBit this suggestion is wrong'"
        @click="reject"
      >
        {{ dismissed ? 'Noted' : 'Wrong' }}
      </button>
    </div>
    </div>

    <!--
      A second row, only when the game showed more than one thing.

      **One press keeps one.** These are cached measurements, not decisions:
      nothing writes a GoodBit row on its own, so keeping a reading is an
      explicit save that carries the reading's own sentence and confidence with
      it. The press also seeks, so what has just been kept is on screen rather
      than taken on trust.

      This is the convenience half of the feature and it is deliberately second.
      Four percent of a real library holds two or more of these, against a bar
      of fifteen for building the release on them, so the bar below the timeline
      is the primary path and this row fills in the few it happens to find.
    -->
    <div
      v-if="anchors.length > 0"
      class="flex flex-wrap items-center gap-1.5 pt-2 border-t border-accent/50"
    >
      <span class="text-xs text-muted-500 mr-1">
        This game showed {{ anchors.length }} moments. Keep any of them:
      </span>

      <button
        v-for="anchor in anchors"
        :key="`${anchor.kind}-${anchor.atSec}`"
        type="button"
        class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors disabled:cursor-default"
        :class="
          keptAlready(anchor)
            ? 'border-accent/60 text-muted-500 bg-accent/4'
            : 'border-accent text-accent-ink hover:bg-accent/16'
        "
        :disabled="keptAlready(anchor)"
        :title="
          keptAlready(anchor)
            ? `Already marked: ${anchor.reason}`
            : `${anchor.reason}. Keep it as a GoodBit, and jump there.`
        "
        @click="keep(anchor)"
      >
        <Icon
          :icon="
            keptAlready(anchor)
              ? 'material-symbols:bookmark-rounded'
              : 'material-symbols:bookmark-add-outline-rounded'
          "
          class="text-sm"
        />
        <span class="font-mono tabular-nums">{{ format(anchor.atSec) }}</span>
        <!--
          The confidence, because these are readings rather than facts and the
          one at 0.81 deserves less trust than the one at 0.98. Three of the
          seven multi-event clips in the measurement had a reading at exactly
          0.0s, which is a kill banner already on screen when the buffer
          started: the tail of something that happened before the recording.
        -->
        <span class="text-[10px] text-muted-500">
          {{ Math.round(anchor.confidence * 100) }}%
        </span>
      </button>

      <!--
        Where *Use it* puts the handles, named, so the row above and this one
        are visibly about the same clip rather than two unrelated readings.
      -->
      <span v-if="strongest" class="text-[11px] text-muted-400 ml-auto">
        Strongest: {{ format(strongest.atSec) }}
      </span>
    </div>
  </div>
      </Transition>
    </div>
  </div>
</template>
