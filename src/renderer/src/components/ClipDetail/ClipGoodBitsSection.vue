<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { useGoodBits } from '@renderer/composables/clips/useGoodBits';
import { durationLabel, goodBitLabel, rangeLabel } from '@renderer/utils/goodBits';
import { SECTION_HEADER } from '@renderer/components/Base/geometry';
import type { Clip } from '@renderer/types/clip';
import type { GoodBit } from '@renderer/types/goodbit';

/**
 * The bits of this clip worth watching, listed.
 *
 * Sits under the player at the player's width, the way `ClipNotesSection` does
 * and for the same reason: a row holding a name, a range, a length and four
 * things you can do to it is not a sidebar's worth of width, and a one line
 * empty state spanning a 21:9 window is not a design.
 *
 * Above the notes, because a GoodBit points at the picture directly above it,
 * and pressing one moves that picture.
 *
 * ## What a row can do, and what it deliberately cannot
 *
 * Play, rename, render out, forget. **Not move its edges**: that is two handles
 * over a frame strip, which is the trimmer, and a pair of number fields in a
 * list is a worse version of a control that already exists. The button in the
 * header goes there, and pressing a band on the strip puts the handles on it.
 *
 * **Forgetting one does not touch the recording**, and the confirmation says so
 * (see `useGoodBits.remove`). That is the difference between this feature and a
 * trim, so it is said at the moment somebody might be worried about it rather
 * than in a heading nobody reads.
 *
 * ## The same list, in the trimmer
 *
 * Pass `range` and this becomes the trimmer's own GoodBits column: the header
 * marks the range the handles are on instead of opening the trimmer, a row
 * puts the handles on itself instead of playing, and the row the handles are
 * on is outlined.
 *
 * One component rather than two, because the two lists are the same list and
 * a second implementation is a second set of paddings to drift. The trimmer
 * had its own bar under the timeline: a heading, a range readout that repeated
 * the one six pixels above it, a name field and a button, all competing with
 * *Save Trimmed Clip* directly beside them. Naming happens on the row here,
 * the same way it does on the details screen, so the bar is gone and the only
 * filled button left on that screen is the one that replaces the recording.
 */
interface Props {
  clip: Clip;
  /**
   * Where the trim handles are, when this is drawn inside the trimmer.
   *
   * Null on the details screen, where there are no handles and the header
   * offers to go and get some instead.
   */
  range?: readonly [number, number] | null;
  /** The row the handles are sitting on, if any. */
  selectedId?: number | null;
  /** Whether the handles have moved off the selected row, or its name changed. */
  dirty?: boolean;
  /** A mark or a save is in flight. */
  busy?: boolean;
  /** False while the handles are somewhere a GoodBit cannot be. */
  canMark?: boolean;
  /**
   * Whether this is the first thing in its column, with nothing above it to be
   * separated from.
   *
   * On the details screen the section follows the player, so the hairline over
   * its heading is what says where one ends and the other begins. In the
   * trimmer's column it is the top of the column, and a rule across the top of
   * a column is a line under nothing.
   */
  flush?: boolean;
  /**
   * Why marking is off, when it is off for a reason worth saying.
   *
   * A disabled button with no explanation is a dead end, and the one case that
   * happens here is worth a sentence: the range under the handles is already
   * marked, so the row for it is on screen a few pixels below.
   */
  markHint?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  range: null,
  selectedId: null,
  dirty: false,
  busy: false,
  canMark: true,
  markHint: null,
  flush: false,
});

const emit = defineEmits<{
  (e: 'play', goodBit: GoodBit): void;
  /** Trimmer only: keep the range the handles are on. */
  (e: 'mark'): void;
  /** Trimmer only: put the handles on this one. */
  (e: 'select', goodBit: GoodBit): void;
  /** Trimmer only: write the moved handles back to the selected row. */
  (e: 'save'): void;
  /** Trimmer only: stop editing the selected row. */
  (e: 'deselect'): void;
}>();

/** Whether this is the trimmer's copy, which is the one with a range. */
const inTrimmer = computed(() => props.range !== null);

const { show } = useClipDetail();

const {
  goodBits,
  loading,
  saving,
  renderingId,
  renderProgress,
  renderEta,
  load,
  edit,
  remove,
  render,
} = useGoodBits(computed(() => props.clip.id));

onMounted(() => void load());

/*
 * A different clip in the same panel reloads.
 *
 * The modal is mounted for the life of the app and opening a second clip while
 * the first is showing swaps the id rather than remounting, so `onMounted`
 * alone would leave the previous clip's GoodBits on screen.
 */
watch(
  () => props.clip.id,
  () => void load(),
);

/** Which row's name field is open. One at a time; a list of live inputs is a form. */
const renaming = ref<number | null>(null);
const draftName = ref('');

function startRenaming(goodBit: GoodBit): void {
  renaming.value = goodBit.id;
  draftName.value = goodBit.name ?? '';
}

/**
 * Save the name, once, whatever ended the edit.
 *
 * **The guard is load-bearing.** Three things end an edit and two of them
 * cascade: Enter blurs the field, and Escape hides it, and in both cases the
 * browser then fires `blur-sm` as well. Without the check on `renaming` the same
 * name was sent twice, and Escape sent the name it was supposed to be
 * abandoning. Clearing `renaming` first and reading it here makes the first
 * finisher the only one.
 */
async function commitName(goodBit: GoodBit): Promise<void> {
  if (renaming.value !== goodBit.id) return;
  renaming.value = null;

  const name = draftName.value.trim() || null;
  if (name === (goodBit.name ?? null)) return;
  await edit(goodBit, { name });
}

/** Escape abandons it: clearing this first is what makes the blur a no-op. */
function cancelRenaming(): void {
  renaming.value = null;
}

/**
 * Whether a detected GoodBit's reason is worth a second line.
 *
 * `source` is the field to read before showing one: a hand-marked GoodBit has
 * no reason and, after the measurement, is the common case. Anything that
 * assumes a reason is present is looking at null most of the time.
 */
function reasonOf(goodBit: GoodBit): string | null {
  return goodBit.source === 'manual' ? null : goodBit.reason;
}

const sourceIcon: Record<string, string> = {
  hud: 'material-symbols:screenshot-monitor',
  audio: 'material-symbols:graphic-eq',
  manual: 'material-symbols:bookmark-rounded',
};
</script>

<template>
  <section :class="flush ? '' : 'border-t border-border pt-5'">
    <div :class="SECTION_HEADER">
      <h2 class="text-sm font-medium text-muted-600 shrink-0">GoodBits</h2>
      <span
        v-if="goodBits.length > 0"
        class="font-mono text-xs tabular-nums text-muted-400 shrink-0"
      >
        {{ goodBits.length }}
      </span>

      <!--
        The way to mark one, and the only way to move one's edges. Two handles
        over a frame strip is the control for a range and it lives in the
        trimmer, so on the details screen this is a door rather than a
        duplicate. In the trimmer the handles are right there, so it marks.
      -->
      <button
        v-if="!inTrimmer && goodBits.length > 0"
        class="ml-auto px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors flex items-center gap-1.5 shrink-0"
        title="Open the trimmer to mark a range, or move one you have marked"
        @click="show('trim')"
      >
        <Icon icon="material-symbols:bookmark-add-outline-rounded" class="text-base" />
        Mark or adjust
      </button>

      <!--
        Editing one, which is what a selected row means: the handles are on it,
        so moving them is how its edges change. *Done* rather than *Cancel*,
        because nothing is pending, the handles have simply been borrowed.
      -->
      <template v-else-if="inTrimmer && selectedId !== null">
        <button
          class="ml-auto px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
          :disabled="busy || !dirty || !canMark"
          :title="dirty ? 'Save where the handles are now' : 'Move a handle to change this one'"
          @click="emit('save')"
        >
          <Icon icon="material-symbols:check-rounded" class="text-base" />
          Save range
        </button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors shrink-0"
          title="Stop editing this one and mark a new range instead"
          @click="emit('deselect')"
        >
          Done
        </button>
      </template>

      <button
        v-else-if="inTrimmer && goodBits.length > 0"
        class="ml-auto px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
        :disabled="busy || !canMark"
        :title="markHint ?? 'Keep the range the handles are on. The recording is not changed.'"
        @click="emit('mark')"
      >
        <Icon icon="material-symbols:bookmark-add-outline-rounded" class="text-base" />
        Mark this range
      </button>
    </div>

    <p v-if="loading" class="text-sm text-muted-500 px-1 py-2">Reading the marks on this clip…</p>

    <!--
      Empty, in one line and a button, the way the notes card does it. There is
      nothing else in here to press, so the whole of it is the press, and the
      line says what a GoodBit is *by saying what it is not*: the one thing
      worth knowing is that this is the thing that does not replace the file.
    -->
    <button
      v-else-if="goodBits.length === 0"
      class="w-full rounded-md border border-dashed border-border bg-card px-4 py-6 text-center hover:border-accent/50 hover:bg-accent/4 transition-colors disabled:opacity-40 disabled:pointer-events-none"
      :disabled="inTrimmer && (busy || !canMark)"
      @click="inTrimmer ? emit('mark') : show('trim')"
    >
      <p class="text-sm text-muted-500">
        Nothing marked yet. A GoodBit names a range and leaves the recording
        whole, unlike a trim, which replaces it.
      </p>
      <span class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
        <Icon icon="material-symbols:add" class="text-lg" />
        {{ inTrimmer ? 'Mark this range' : 'Mark a range' }}
      </span>
    </button>

    <ul v-else class="space-y-1.5">
      <li
        v-for="goodBit in goodBits"
        :key="goodBit.id"
        class="relative overflow-hidden rounded-md border bg-background/40 px-3 py-2"
        :class="goodBit.id === selectedId ? 'border-accent' : 'border-border'"
      >
        <!--
          The render's own progress, as the row filling.

          A cut re-encodes, which on a 3440 wide recording is tens of seconds,
          and the toast reporting it can be scrolled away from or covered. The
          row is where the press happened, so the row shows what it started.
        -->
        <span
          v-if="renderingId === goodBit.id"
          class="absolute inset-y-0 left-0 bg-accent/16 transition-[width] duration-200 ease-linear"
          :style="{ width: `${Math.max(2, renderProgress)}%` }"
          aria-hidden="true"
        ></span>

        <div class="relative flex items-center gap-2">
          <!--
            On the details screen this plays the range. In the trimmer it puts
            the handles on it, which seeks there and loops it, so the glyph
            means the same thing in both: the picture goes to this moment.
          -->
          <button
            class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-accent-ink hover:bg-accent/10 transition-colors"
            :title="
              inTrimmer
                ? `Put the handles on ${goodBitLabel(goodBit)}`
                : `Play ${goodBitLabel(goodBit)}`
            "
            :aria-label="
              inTrimmer
                ? `Edit ${goodBitLabel(goodBit)}`
                : `Play ${goodBitLabel(goodBit)}`
            "
            @click="inTrimmer ? emit('select', goodBit) : emit('play', goodBit)"
          >
            <Icon icon="material-symbols:play-arrow-rounded" class="text-xl" />
          </button>

          <div class="min-w-0 flex-1">
            <!--
              The name, edited in place. A bare input that only shows its box on
              hover, the way `ClipNameInput` does it, so a list of eight rows is
              a list rather than a column of form fields.
            -->
            <input
              v-if="renaming === goodBit.id"
              v-model="draftName"
              type="text"
              maxlength="60"
              class="w-full bg-card border border-accent/60 rounded-sm px-1.5 py-0.5 text-sm font-medium outline-hidden"
              :aria-label="`Name for the GoodBit at ${rangeLabel(goodBit.startSec, goodBit.endSec)}`"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              @keydown.esc="cancelRenaming"
              @blur="commitName(goodBit)"
            />
            <button
              v-else
              class="group/name w-full text-left truncate text-sm font-medium text-foreground rounded-sm px-1.5 py-0.5 border border-transparent hover:border-border hover:bg-card/60 transition-colors"
              :title="`${goodBitLabel(goodBit)}\n\nClick to rename it. The recording keeps its own name.`"
              @click="startRenaming(goodBit)"
            >
              {{ goodBitLabel(goodBit) }}
            </button>

            <div class="flex items-center gap-2 px-1.5 text-xs text-muted-500 min-w-0">
              <!--
                The range, only when the line above is a name. `goodBitLabel`
                falls back to the range for a GoodBit nobody has named, which
                is the normal case for one marked from the trimmer, and this
                row then read `0:17 – 0:24` twice, one line apart.
              -->
              <span v-if="goodBit.name" class="font-mono tabular-nums shrink-0">
                {{ rangeLabel(goodBit.startSec, goodBit.endSec) }}
              </span>
              <span class="shrink-0">{{ durationLabel(goodBit.durationSec) }}</span>

              <!--
                Where it came from, and what the detector said, when a detector
                said anything. A manual GoodBit gets no badge: it is the normal
                case, and a badge reading "manual" on nearly every row is a
                column of noise.
              -->
              <span
                v-if="reasonOf(goodBit)"
                class="inline-flex items-center gap-1 min-w-0 text-accent-ink"
              >
                <Icon :icon="sourceIcon[goodBit.source]" class="text-sm shrink-0" />
                <span class="truncate">{{ reasonOf(goodBit) }}</span>
                <span v-if="goodBit.confidence !== null" class="shrink-0 text-muted-400">
                  {{ Math.round(goodBit.confidence * 100) }}%
                </span>
              </span>

              <span v-if="renderingId === goodBit.id" class="ml-auto shrink-0 tabular-nums">
                Rendering {{ renderProgress }}%{{ renderEta ? `, ${renderEta} left` : '' }}
              </span>
            </div>
          </div>

          <!--
            Rendering writes a new clip into the library and this recording keeps
            its GoodBits. That is the answer to "what does publishing a GoodBit
            produce": a normal clip on disk, which every other surface already
            understands, rather than a second kind of clip.
          -->
          <button
            class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-500 hover:text-foreground hover:bg-muted-50 transition-colors disabled:opacity-40"
            :disabled="renderingId !== null"
            :title="
              renderingId !== null
                ? 'One GoodBit is already being written out'
                : 'Write this out as its own clip in the library. The recording is untouched.'
            "
            :aria-label="`Render ${goodBitLabel(goodBit)} as its own clip`"
            @click="render(goodBit)"
          >
            <Icon icon="material-symbols:movie-edit-outline-rounded" class="text-lg" />
          </button>

          <button
            class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-500 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
            :disabled="saving || renderingId === goodBit.id"
            title="Forget this GoodBit. The recording is not touched."
            :aria-label="`Forget ${goodBitLabel(goodBit)}`"
            @click="remove(goodBit)"
          >
            <Icon icon="material-symbols:bookmark-remove-outline-rounded" class="text-lg" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
