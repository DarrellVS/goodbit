<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { durationLabel, goodBitLabel, rangeLabel, sameRange } from '@renderer/utils/goodBits';
import type { GoodBit } from '@renderer/types/goodbit';

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
  <div class="rounded-xl border border-border bg-card/40 px-4 py-3 space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2 shrink-0">
        <Icon icon="material-symbols:bookmark-add-outline-rounded" class="text-lg text-orange-500" />
        <span class="text-sm font-semibold text-foreground">
          {{ selected ? 'Editing a GoodBit' : 'Mark a GoodBit' }}
        </span>
      </div>

      <!--
        The range, read off the handles. Tabular figures, or the row shifts
        sideways every tenth of a second while a handle is being dragged.
      -->
      <span class="text-xs font-mono tabular-nums text-muted-500 shrink-0">
        {{ rangeLabel(range[0], range[1]) }} · {{ durationLabel(length) }}
      </span>

      <input
        v-model="name"
        type="text"
        maxlength="60"
        class="min-w-0 flex-1 basis-40 rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-hidden focus:border-orange-500/60 focus:ring-2 focus:ring-ring/40 transition"
        :placeholder="selected ? goodBitLabel(selected) : 'Name it, or leave this blank'"
        :aria-label="selected ? 'Name for this GoodBit' : 'Name for the GoodBit you are about to mark'"
        @keydown.enter.prevent="submit"
      />

      <template v-if="selected">
        <button
          type="button"
          class="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:hover:bg-orange-500"
          :disabled="saving || !dirty || !valid"
          :title="dirty ? 'Save the new name and range' : 'Nothing has changed yet'"
          @click="submit"
        >
          <Icon icon="material-symbols:check-rounded" class="text-base" />
          Save changes
        </button>

        <button
          type="button"
          class="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted-600 hover:bg-muted-50 transition-colors"
          title="Stop editing this one and mark a new range instead"
          @click="emit('deselect')"
        >
          Done
        </button>

        <button
          type="button"
          class="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
          :disabled="saving"
          title="Forget this GoodBit. The recording is not touched."
          @click="emit('forget', selected)"
        >
          <Icon icon="material-symbols:bookmark-remove-outline-rounded" class="text-base" />
          Forget
        </button>
      </template>

      <button
        v-else
        type="button"
        class="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:hover:bg-orange-500"
        :disabled="saving || !valid || duplicate"
        :title="
          duplicate
            ? 'This exact range is already marked'
            : 'Keep this range as a GoodBit. The recording is not changed.'
        "
        @click="submit"
      >
        <Icon icon="material-symbols:bookmark-add-outline-rounded" class="text-base" />
        Mark this range
      </button>
    </div>

    <!--
      One line of footnote, and it changes rather than stacking.

      What it says depends on what is true: that this range is already marked,
      that it sits on top of one that is, or which one is being edited.

      **The sentence that defines the feature is not conditional any more.**
      "A GoodBit names a range and leaves the recording whole, unlike a trim,
      which replaces it" was the empty state, and a walkthrough user called it
      the single most useful sentence in the app. It then disappeared the
      moment they made their first mark, which is exactly when they started
      needing to know that this button and the orange one above it do opposite
      things to the file. A second-time user never saw it at all. It sits under
      the line below now, in the muted ladder so it reads as a standing note
      rather than as news.
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
      <template v-else-if="count === 0">
        Nothing marked yet.
      </template>
      <template v-else>
        {{ count }} marked on this clip. Press one below, or a band on the strip,
        to change it.
      </template>
    </p>
    <p class="text-xs text-muted-400">
      A GoodBit names a range and leaves the recording whole, unlike a trim,
      which replaces it.
    </p>

    <!--
      What is already marked, listed where it was made.

      The strip above draws these as bands, which is right for showing *where*
      they are and useless for reading *what* they are: a one second moment in
      a five minute clip is a few pixels wide and carries no name. So the same
      GoodBits are also chips here, in the order they happen, and pressing one
      does exactly what pressing its band does.
    -->
    <div v-if="goodBits.length > 0" class="flex flex-wrap items-center gap-1.5 pt-1">
      <button
        v-for="goodBit in goodBits"
        :key="goodBit.id"
        type="button"
        class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
        :class="goodBit.id === selected?.id
          ? 'border-orange-500 bg-orange-500/16 text-orange-600'
          : 'border-border bg-card text-muted-700 hover:border-muted-300 hover:bg-muted-50'"
        :title="`Put the handles on ${goodBitLabel(goodBit)}`"
        :aria-pressed="goodBit.id === selected?.id"
        @click="emit('select', goodBit)"
      >
        <Icon
          :icon="goodBit.source === 'manual'
            ? 'material-symbols:bookmark-rounded'
            : 'material-symbols:auto-awesome-rounded'"
          class="shrink-0 text-sm"
        />
        <span class="truncate">{{ goodBitLabel(goodBit) }}</span>
        <span class="shrink-0 font-mono tabular-nums text-muted-400">
          {{ rangeLabel(goodBit.startSec, goodBit.endSec) }}
        </span>
      </button>
    </div>
  </div>
</template>
