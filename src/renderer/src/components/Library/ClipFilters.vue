<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipsStore, CLIP_SORTS, type ClipSort } from '@renderer/stores/clips';
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import type { ComboBoxValue } from '@renderer/components/Base/types';
import { QUIET_CONTROL_HEIGHT } from '@renderer/components/Base/geometry';
import { useTheme } from '@renderer/composables/ui/useTheme';
import ClipFilterPopover from './ClipFilterPopover.vue';

/**
 * One row that describes the list below it, and chooses what to act on.
 *
 * Everything that narrows the library is reachable from here. It used to be
 * spread over two rows, a popover and the sidebar: four tabs and the sort
 * lived here, filtering by tag was a button beside the search field, filtering
 * by game was in the sidebar, and *Select* was in a bar that floated over the
 * clips whether or not anybody was selecting.
 *
 * Nine standing controls, so the row is now two views, one Filter popover,
 * the sort, Select and the count. The popover is the right shape for the three
 * questions it holds because they are questions about the same list; a
 * dropdown each put them in competition with the two views, which are not
 * filters at all but the way most people use the screen.
 *
 * Left to right: which clips, then how they are narrowed and ordered, then
 * what to do with them, then how many there are, then the palette.
 *
 * **The line is mostly text**, which is the design's phrase for it and is not
 * a style note. Everything in the right hand group describes the list below it
 * rather than changing what is in it, and a box gives a control the weight of
 * one that does; the sort was the only rectangle on the line and read as the
 * important thing on it. They are the quiet class now, all at
 * `QUIET_CONTROL_HEIGHT`, because one height per class is still the rule and
 * "no border" is not the same as "no height".
 */
interface Props {
  totalCount: number;
  /** Drawn as *Cancel*, since there is no longer a floating bar to leave. */
  isSelectionMode?: boolean;
  /**
   * Off for a collection.
   *
   * `GET /collections/:id/clips` takes no `sort`, so the control would reorder
   * nothing there. A dropdown that does nothing is worse than no dropdown.
   */
  sortable?: boolean;
  /**
   * Sitting inside a header that already has its own hairline and padding.
   *
   * The collection layer puts this row in its header rather than above the
   * grid, so the row must not bring a second bottom border or its own top
   * padding with it. Whole class strings either way rather than a built up
   * one, because a Tailwind class assembled at runtime is a class Tailwind
   * never saw and never generated.
   */
  flush?: boolean;
}

interface Emits {
  (e: 'enter-selection'): void;
  (e: 'exit-selection'): void;
}

const props = withDefaults(defineProps<Props>(), {
  isSelectionMode: false,
  sortable: true,
  flush: false,
});
const emit = defineEmits<Emits>();

const clipsStore = useClipsStore();
const { isDark, setTheme } = useTheme();

/**
 * One control, two states, no third.
 *
 * `useTheme` also holds `system`, and Settings is where that is chosen. A
 * toggle in a toolbar answers "lighter or darker, now", and a three-way
 * control that has to explain its middle state does not belong on the end of
 * a line of filters.
 */
function toggleTheme(): void {
  setTheme(isDark.value ? 'light' : 'dark');
}

/** Every control in the line, at the one height controls in this line are. */
const QUIET =
  QUIET_CONTROL_HEIGHT +
  ' inline-flex items-center gap-1.5 rounded-md px-1 text-sm text-muted-600' +
  ' hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150';

const rowClass = computed(() =>
  props.flush
    ? 'flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pb-3.5'
    : 'flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 pt-7 pb-3.5',
);

/**
 * Two views, not four filters.
 *
 * `Published` and `Not published` used to be tabs beside these, which made
 * four mutually exclusive things out of two questions and meant starring could
 * not be combined with either. They are in the popover's State section now,
 * where `Starred` sits beside them as its own answer rather than instead of
 * them.
 */
const VIEWS = [
  { starred: false, label: 'All' },
  { starred: true, label: 'Starred' },
] as const;

const sortOptions = computed(() =>
  CLIP_SORTS.map((sort) => ({ value: sort.value, label: sort.label })),
);

function onSortChange(value: ComboBoxValue | ComboBoxValue[] | null): void {
  if (value === null || Array.isArray(value)) return;
  clipsStore.setSort(value as ClipSort);
}
</script>

<template>
  <div :class="rowClass">
    <nav class="flex items-center gap-2.5 -ml-2.5" aria-label="Which clips">
      <!--
        The rule is an overlay, not a border.

        A `border-b-2` is part of the tab's own box, so it and the row's
        hairline were competing to be the same pixel and `-mb-px` was papering
        over it. An absolutely positioned bar sits under the label at the
        label's own width, costs no layout, and lets the row's hairline be the
        row's.
      -->
      <button
        v-for="view in VIEWS"
        :key="view.label"
        type="button"
        class="relative h-8 min-w-11 px-2.5 text-sm outline-none focus-visible:focus-ring rounded-sm transition-colors duration-150"
        :class="clipsStore.starredFilter === view.starred
          ? 'text-foreground font-medium'
          : 'text-muted-500 hover:text-foreground'"
        :aria-current="clipsStore.starredFilter === view.starred ? 'page' : undefined"
        @click="clipsStore.setStarredFilter(view.starred)"
      >
        {{ view.label }}
        <span
          v-if="clipsStore.starredFilter === view.starred"
          aria-hidden="true"
          class="absolute inset-x-2.5 -bottom-1.5 h-0.5 bg-accent"
        />
      </button>
    </nav>

    <div class="ml-auto flex items-center gap-4">
      <ClipFilterPopover />

      <!--
        The library had no sort at all: newest first was the only order on
        offer. It sits beside the count because both describe the list you are
        looking at rather than changing what is in it, and it is quiet for the
        same reason.
      -->
      <BaseComboBox
        v-if="sortable"
        variant="quiet"
        label="Order the clips"
        :model-value="clipsStore.sort"
        :options="sortOptions"
        @update:model-value="onSortChange"
      />

      <!--
        Select is a toggle, which it did not have to be while the floating bar
        carried a Cancel of its own. That bar is only the batch toolbar now and
        the toolbar appears on a selection, so with nothing picked yet this is
        the only way out other than Esc.
      -->
      <button
        v-if="isSelectionMode"
        type="button"
        :class="[QUIET, 'text-foreground']"
        title="Stop selecting (Esc)"
        @click="emit('exit-selection')"
      >
        Cancel
      </button>
      <button
        v-else
        type="button"
        :class="QUIET"
        :aria-pressed="false"
        title="Pick clips to star, tag, publish, move or delete together (Ctrl+A for all of them)"
        @click="emit('enter-selection')"
      >
        Select
      </button>

      <!--
        A number about the list. Tabular, so the row does not breathe when a
        filter changes the count, and in the UI face rather than the mono one:
        mono is for a measurement you read digit by digit, and this is a
        sentence that happens to start with a number.
      -->
      <div class="text-sm tabular-nums text-muted-400 whitespace-nowrap" role="status">
        {{ totalCount }} {{ totalCount === 1 ? 'clip' : 'clips' }}
      </div>

      <button
        type="button"
        class="size-8 inline-flex items-center justify-center shrink-0 rounded-md text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
        :aria-pressed="isDark"
        :title="isDark ? 'Switch to the light palette' : 'Switch to the dark palette'"
        :aria-label="isDark ? 'Switch to the light palette' : 'Switch to the dark palette'"
        @click="toggleTheme"
      >
        <Icon
          :icon="isDark ? 'material-symbols:light-mode-outline' : 'material-symbols:dark-mode-outline'"
          class="size-4 shrink-0 block"
        />
      </button>
    </div>
  </div>
</template>
