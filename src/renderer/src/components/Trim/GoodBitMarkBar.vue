<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { durationLabel, goodBitLabel, rangeLabel, sameRange } from '../../utils/goodBits';
import type { GoodBit } from '../../types/goodbit';

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
  /** How many this clip holds, so the bar can say when there is nothing yet. */
  count: number;
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
}>();

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
  if (!duplicate.value) emit('mark', submitted.value);
}
</script>

<template>
  <div class="rounded-xl border border-border bg-card/40 px-4 py-3 space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2 flex-shrink-0">
        <Icon icon="material-symbols:bookmark-add-outline-rounded" class="text-lg text-orange-500" />
        <span class="text-sm font-semibold text-foreground">
          {{ selected ? 'Editing a GoodBit' : 'Mark a GoodBit' }}
        </span>
      </div>

      <!--
        The range, read off the handles. Tabular figures, or the row shifts
        sideways every tenth of a second while a handle is being dragged.
      -->
      <span class="text-xs font-mono tabular-nums text-muted-500 flex-shrink-0">
        {{ rangeLabel(range[0], range[1]) }} · {{ durationLabel(length) }}
      </span>

      <input
        v-model="name"
        type="text"
        maxlength="60"
        class="min-w-0 flex-1 basis-40 rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-ring/40 transition"
        :placeholder="selected ? goodBitLabel(selected) : 'Name it, or leave this blank'"
        :aria-label="selected ? 'Name for this GoodBit' : 'Name for the GoodBit you are about to mark'"
        @keydown.enter.prevent="submit"
      />

      <template v-if="selected">
        <button
          type="button"
          class="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:hover:bg-orange-500"
          :disabled="saving || !dirty || !valid"
          :title="dirty ? 'Save the new name and range' : 'Nothing has changed yet'"
          @click="submit"
        >
          <Icon icon="material-symbols:check-rounded" class="text-base" />
          Save changes
        </button>

        <button
          type="button"
          class="flex-shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted-600 hover:bg-muted-50 transition-colors"
          title="Stop editing this one and mark a new range instead"
          @click="emit('deselect')"
        >
          Done
        </button>

        <button
          type="button"
          class="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
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
        class="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:hover:bg-orange-500"
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

      What it says depends on what is true: that the recording survives this
      (the thing that makes a GoodBit not a trim, said where somebody is about
      to press the button), that this range is already marked, or that it sits
      on top of one that is.
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
        Nothing marked yet. A GoodBit names a range and leaves the recording
        whole, unlike a trim, which replaces it.
      </template>
      <template v-else>
        {{ count }} marked on this clip. Press a band on the strip to change one.
      </template>
    </p>
  </div>
</template>
