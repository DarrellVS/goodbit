<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { durationLabel, goodBitLabel, rangeLabel, sameRange } from '@renderer/utils/goodBits';
import type { GoodBit } from '@renderer/types/goodbit';
import BaseField from '@renderer/components/Base/BaseField.vue';

/**
 * Marking the range the handles are on, without cutting anything.
 *
 * **This is the primary path, not the detected one.** `scripts/hud-check.mjs`
 * over 174 real recordings found two or more confident moments in 4% of them,
 * against a bar of 15% for calling detection the headline. A person watching a
 * clip knows it has two good bits whether or not a kill banner appeared, so the
 * control that matters is this one: put the handles somewhere, give it a name if
 * you feel like it, press the button.
 *
 * It sits directly under the timeline and beside the trim button on purpose.
 * The two are the same gesture with different consequences, and the difference
 * is the only thing worth saying out loud: one keeps the recording, the other
 * replaces it. So they are next to each other and each says which it is.
 *
 * **One bar, two states.** With nothing selected it marks a new GoodBit. With a
 * band selected (pressed on the strip above) it is that GoodBit's own row: the
 * name field holds its name, the handles hold its range, and saving writes both
 * back. A second control for editing one would mean two ways to set a range and
 * only one of them would be the handles.
 */
interface Props {
  /** Where the handles are now. */
  range: readonly [number, number];
  /** The GoodBit the handles were put on, if any. */
  selected: GoodBit | null;
  /**
   * Every GoodBit on this clip, newest handling first as the API returns them.
   *
   * The bar used to take a bare `count`, which could say "3 marked on this
   * clip" and then leave you hunting three bands a few pixels wide on the
   * strip above to find one. It lists them now, so the ones you have made are
   * readable and reachable from the place you made them.
   */
  goodBits: readonly GoodBit[];
  /** A create, rename or delete is in flight. */
  saving?: boolean;
  /** Which saved GoodBits this range would sit on top of. A remark, not a block. */
  clashes?: readonly GoodBit[];
  /** False while the handles are somewhere a GoodBit cannot be. */
  valid?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  saving: false,
  clashes: () => [],
  valid: true,
});

const emit = defineEmits<{
  (e: 'mark', name: string | null): void;
  (e: 'save', name: string | null): void;
  (e: 'deselect'): void;
  (e: 'forget', goodBit: GoodBit): void;
  (e: 'select', goodBit: GoodBit): void;
}>();

/** How many this clip holds, read off the list rather than passed beside it. */
const count = computed(() => props.goodBits.length);

/**
 * What is in the name field.
 *
 * Local, and reset whenever the selection changes: the field belongs to
 * whichever GoodBit is being edited, and a half-typed name for one should not
 * follow the user onto another.
 */
const name = ref('');

watch(
  () => props.selected?.id ?? null,
  () => {
    name.value = props.selected?.name ?? '';
  },
  { immediate: true },
);

const trimmed = computed(() => name.value.trim());

/** Null rather than the empty string: a nameless GoodBit falls back to its range. */
const submitted = computed(() => trimmed.value || null);

const length = computed(() => Math.max(0, props.range[1] - props.range[0]));

/** Whether anything about the selected GoodBit has actually moved. */
const dirty = computed(() => {
  const selected = props.selected;
  if (!selected) return false;

  const renamed = (selected.name ?? '') !== trimmed.value;
  const moved = !sameRange(
    { startSec: props.range[0], endSec: props.range[1] },
    selected,
    0.05,
  );
  return renamed || moved;
});

/**
 * Whether this range is one already marked.
 *
 * Marking the same range twice is the one overlap worth stopping rather than
 * remarking on: it is never deliberate, and it leaves two identical rows that
 * only differ by id.
 */
const duplicate = computed(() =>
  props.selected === null &&
  props.clashes.some((other) =>
    sameRange({ startSec: props.range[0], endSec: props.range[1] }, other),
  ),
);

function submit(): void {
  if (props.saving || !props.valid) return;
  if (props.selected) {
    if (dirty.value) emit('save', submitted.value);
    return;
  }
  if (duplicate.value) return;

  emit('mark', submitted.value);
  /*
   * The field empties on mark, because the name belonged to the range that
   * has just been marked.
   *
   * Marking deliberately leaves nothing selected, so the watch above never
   * fires and the name simply stayed. The next range then arrived carrying
   * the last one's name, already typed, and the button reads *Mark this
   * range*, so the second one would quietly be named after the first.
   */
  name.value = '';
}
</script>

<template>
  <!--
    Its own quiet band, which is what the design calls it. Marking a range
    leaves the recording whole, so it must not look like the control above it
    that replaces the file.

    **Four stacked blocks became three, and none of them moves.** This was a
    wrapping row of controls, a footnote, a standing note and then a wrapping
    field of chips: on a clip with six GoodBits it stood five lines tall, and
    it changed height as you marked, which in a modal means the picture above
    it resizes while you are watching it. The chips are one row that scrolls
    sideways now and the two sentences are one sentence.
  -->
  <div class="border-t border-border pt-3.5 space-y-2">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <!--
        The state, said the way every other label in this design is said. It
        was an accent glyph beside sentence case text, which is the shape of a
        banner rather than of a label on a control.
      -->
      <span class="shrink-0 text-xs font-medium uppercase tracking-label text-muted-400">
        {{ selected ? 'Editing a GoodBit' : 'Mark a GoodBit' }}
      </span>

      <!--
        The range, read off the handles. Tabular figures, or the row shifts
        sideways every tenth of a second while a handle is being dragged.
      -->
      <span class="shrink-0 font-mono text-xs tabular-nums text-muted-500">
        {{ rangeLabel(range[0], range[1]) }} &middot; {{ durationLabel(length) }}
      </span>

      <BaseField class="min-w-0 flex-1 basis-40">
        <input
          v-model="name"
          type="text"
          maxlength="60"
          class="text-sm"
          :placeholder="selected ? goodBitLabel(selected) : 'Name it, or leave this blank'"
          :aria-label="
            selected ? 'Name for this GoodBit' : 'Name for the GoodBit you are about to mark'
          "
          @keydown.enter.prevent="submit"
        />
      </BaseField>

      <template v-if="selected">
        <button
          type="button"
          class="shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-md text-sm font-medium bg-accent text-accent-fg hover:bg-accent-hover outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          :disabled="saving || !dirty || !valid"
          :title="dirty ? 'Save the new name and range' : 'Nothing has changed yet'"
          @click="submit"
        >
          <Icon icon="material-symbols:check-rounded" class="size-4 shrink-0 block" />
          Save changes
        </button>

        <button
          type="button"
          class="shrink-0 inline-flex items-center h-9 px-3 rounded-md text-sm text-muted-600 hover:bg-muted-50 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
          title="Stop editing this one and mark a new range instead"
          @click="emit('deselect')"
        >
          Done
        </button>

        <button
          type="button"
          class="shrink-0 inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm text-danger-ink hover:bg-danger/10 outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          :disabled="saving"
          title="Forget this GoodBit. The recording is not touched."
          @click="emit('forget', selected)"
        >
          <Icon
            icon="material-symbols:bookmark-remove-outline-rounded"
            class="size-4 shrink-0 block"
          />
          Forget
        </button>
      </template>

      <!--
        Outlined, not filled, and that is a safety decision rather than taste.

        This and "Save Trimmed Clip" were the same size, the same orange and
        the same weight, ninety pixels apart, and they do opposite things to
        the file: one writes a bookmark and changes nothing, the other replaces
        the recording. The only thing telling them apart was reading the words.
        An independent reviewer called it the most dangerous thing on the
        screen, and they are right: a destructive action must not look like its
        safe neighbour.

        The safe one gives up the fill. It is still obviously a button, so
        nothing is lost except the claim to be the same kind of act as the one
        above it.
      -->
      <button
        v-else
        type="button"
        class="shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-md text-sm font-medium border border-line-strong text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
        :disabled="saving || !valid || duplicate"
        :title="
          duplicate
            ? 'This exact range is already marked'
            : 'Keep this range as a GoodBit. The recording is not changed.'
        "
        @click="submit"
      >
        <Icon icon="material-symbols:bookmark-add-outline-rounded" class="size-4 shrink-0 block" />
        Mark this range
      </button>
    </div>

    <!--
      One line, and it changes rather than stacking.

      What it says depends on what is true: that this range is already marked,
      that it sits on top of one that is, or which one is being edited.

      **The sentence that defines the feature is not conditional any more.**
      "A GoodBit names a range and leaves the recording whole, unlike a trim,
      which replaces it" was the empty state, and a walkthrough user called it
      the single most useful sentence in the app. It then disappeared the
      moment they made their first mark, which is exactly when they started
      needing to know that this button and the orange one above it do opposite
      things to the file. So it is always there, one rung quieter, at the end
      of whatever else this line is saying rather than on a line of its own.
    -->
    <p class="text-xs text-muted-500">
      <template v-if="duplicate">
        This exact range is already marked. Move a handle, or edit the one that is
        there.
      </template>
      <template v-else-if="clashes.length > 0">
        Overlaps {{ clashes.map(goodBitLabel).join(', ') }}. That is allowed: a
        long moment and the best second of it are both worth keeping.
      </template>
      <template v-else-if="selected">
        Drag the handles to move this one, or press another band on the strip.
      </template>
      <template v-else-if="count > 0">
        {{ count }} marked on this clip. Press one below, or a band on the strip,
        to change it.
      </template>
      <span class="text-muted-400">
        A GoodBit names a range and leaves the recording whole, unlike a trim, which
        replaces it.
      </span>
    </p>

    <!--
      What is already marked, listed where it was made.

      The strip above draws these as bands, which is right for showing *where*
      they are and useless for reading *what* they are: a one second moment in
      a five minute clip is a few pixels wide and carries no name. So the same
      GoodBits are also chips here, in the order they happen, and pressing one
      does exactly what pressing its band does.

      One row that scrolls sideways rather than a field that wraps. They are in
      time order, so sideways is the direction they already run in.
    -->
    <div
      v-if="goodBits.length > 0"
      class="flex items-center gap-1.5 overflow-x-auto scroll-p-1.5 p-1 -m-1 scrollbar-hide"
    >
      <button
        v-for="goodBit in goodBits"
        :key="goodBit.id"
        type="button"
        class="h-7 shrink-0 inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-2.5 text-xs outline-none focus-visible:focus-ring transition-colors duration-150"
        :class="goodBit.id === selected?.id
          ? 'border-accent bg-accent/12 text-foreground'
          : 'border-border text-muted-600 hover:bg-muted-50 hover:text-foreground'"
        :title="`Put the handles on ${goodBitLabel(goodBit)}`"
        :aria-pressed="goodBit.id === selected?.id"
        @click="emit('select', goodBit)"
      >
        <Icon
          :icon="goodBit.source === 'manual'
            ? 'material-symbols:bookmark-rounded'
            : 'material-symbols:auto-awesome-rounded'"
          class="size-3.5 shrink-0 block"
        />
        <span class="truncate">{{ goodBitLabel(goodBit) }}</span>
        <span class="shrink-0 font-mono tabular-nums text-muted-400">
          {{ rangeLabel(goodBit.startSec, goodBit.endSec) }}
        </span>
      </button>
    </div>
  </div>
</template>
