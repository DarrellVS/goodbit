<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import Wordmark from '@renderer/components/Shell/Wordmark.vue';
import { anchorName, momentCovered } from '@renderer/utils/goodBits';
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

/**
 * What the line after the range says.
 *
 * With one reading it is that reading's own sentence. With several the
 * suggested cut spans all of them, so the sentence has to be about the set:
 * naming the strongest and saying nothing about the rest is how a cut that
 * deliberately holds three moments reads as a cut that found one.
 */
const detail = computed(() => {
  if (anchors.value.length > 1) {
    return `${anchors.value.length} GoodBits, and this keeps all of them`;
  }
  return evidence.value
    ? evidence.value
    : `${seconds.value}s, which is usually where the good bit is`;
});

function keptAlready(anchor: SuggestionEvent): boolean {
  return momentCovered(anchor.atSec, props.goodBits);
}

/**
 * Whether this reading is one where things went badly.
 *
 * Drawn in the quiet ladder rather than in the accent, because the accent
 * means the good bit and has one meaning. A death is worth keeping often
 * enough to be offered and is not the thing the accent is for; the word on the
 * chip says which it is, and the colour keeps them apart at a glance.
 */
function isDeath(anchor: SuggestionEvent): boolean {
  return anchor.kind === 'death';
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

    **The delay is on the way in only.** Opening the trimmer scales the whole
    panel in over 260ms, and this row growing at the same moment is two
    animations arguing about where the picture above them ends: it reads as the
    panel stuttering rather than as a banner arriving. Half a second lets the
    panel land first. The delay lives on the class that is applied while it is
    open, so it is spent expanding and never on the way out, where waiting for
    a row to leave would be a row that hangs about.
  -->
  <div
    class="grid transition-[grid-template-rows] duration-300 ease-out"
    :class="occupied ? 'grid-rows-[1fr] delay-500' : 'grid-rows-[0fr] delay-0'"
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
    class="flex items-center gap-2 px-4 py-2.5 rounded-md border border-border bg-card/60 text-sm text-muted-500"
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
    class="px-4 py-2.5 rounded-md border border-accent bg-accent/6 space-y-2"
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

      The same ranges are drawn as outlines along the strip, which is where a
      range belongs: this row names them and says how sure the reading was,
      which an outline cannot, and the strip says where in half a minute of
      footage they are, which a row of times cannot. Two of them side by side
      was the other idea, and it makes two banners argue about which is the
      answer.

      This is still the convenience half of the feature and it is deliberately
      second: the mark bar below the timeline is the primary path, because a
      person watching a clip knows it has two good bits whether or not the
      game happened to say so.
    -->
    <div
      v-if="anchors.length > 0"
      class="flex flex-wrap items-center gap-1.5 pt-2 border-t border-accent/50"
    >
      <span class="text-xs text-muted-500 mr-1">
        This game showed {{ anchors.length }} GoodBits, outlined on the strip. Keep any of them:
      </span>

      <button
        v-for="anchor in anchors"
        :key="`${anchor.kind}-${anchor.atSec}`"
        type="button"
        class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors disabled:cursor-default"
        :class="
          keptAlready(anchor)
            ? isDeath(anchor)
              ? 'border-border text-muted-500 bg-muted-50'
              : 'border-accent/60 text-muted-500 bg-accent/4'
            : isDeath(anchor)
              ? 'border-border text-muted-700 hover:bg-muted-100'
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
          What this reading is, in the word it will be saved under. A row of
          times alone cannot say that one of these is a kill and the next one
          is where you went down, and the colour only says which is which to
          somebody who has been told.
        -->
        <span v-if="anchorName(anchor)" class="font-medium">{{ anchorName(anchor) }}</span>
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
    </div>
  </div>
      </Transition>
    </div>
  </div>
</template>
