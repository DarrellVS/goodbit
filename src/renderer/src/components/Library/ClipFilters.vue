<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipsStore, CLIP_SORTS, type ClipSort } from '@renderer/stores/clips';
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import { COMBO_BOX_HEIGHT, type ComboBoxValue } from '@renderer/components/Base/types';
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
 * what to do with them, then how many there are. The whole right hand group is
 * `h-9`, because `COMBO_BOX_HEIGHT` is not a prop: two controls of the same
 * kind at two heights is the thing `BaseComboBox` exists to stop.
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

const rowClass = computed(() =>
  props.flush
    ? 'flex flex-wrap items-center gap-x-3 gap-y-2 px-6'
    : 'flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-6 pt-6',
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
  <!--
    The hairline is the row's, and the views sit on it: `-mb-px` puts the
    active view's own 2px underline over the top of it rather than a pixel
    below. Both states carry `border-b-2`, so becoming active changes a colour
    and never a height.
  -->
  <div :class="rowClass">
    <nav class="flex items-center gap-6" aria-label="Which clips">
      <button
        v-for="view in VIEWS"
        :key="view.label"
        type="button"
        class="-mb-px h-11 px-1 border-b-2 text-sm outline-none focus-visible:focus-ring transition-colors duration-150"
        :class="clipsStore.starredFilter === view.starred
          ? 'border-accent text-foreground font-medium'
          : 'border-transparent text-muted-500 hover:text-foreground'"
        :aria-current="clipsStore.starredFilter === view.starred ? 'page' : undefined"
        @click="clipsStore.setStarredFilter(view.starred)"
      >
        {{ view.label }}
      </button>
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <ClipFilterPopover />

      <!--
        The library had no sort at all: newest first was the only order on
        offer. It sits beside the count because both describe the list you are
        looking at rather than changing what is in it.
      -->
      <BaseComboBox
        v-if="sortable"
        class="w-44"
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
        :class="[COMBO_BOX_HEIGHT, 'inline-flex items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 hover:bg-muted-50']"
        title="Stop selecting (Esc)"
        @click="emit('exit-selection')"
      >
        <Icon icon="material-symbols:close" class="size-4 shrink-0 block" />
        <span>Cancel</span>
      </button>
      <button
        v-else
        type="button"
        :class="[COMBO_BOX_HEIGHT, 'inline-flex items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 hover:bg-muted-50']"
        title="Pick clips to star, tag, publish, move or delete together (Ctrl+A for all of them)"
        @click="emit('enter-selection')"
      >
        <Icon icon="material-symbols:check-box-outline-blank" class="size-4 shrink-0 block" />
        <span>Select</span>
      </button>

      <!--
        A number about the list, so it is in the face numbers are in, and
        tabular, so the row does not breathe when a filter changes the count.
      -->
      <div class="font-mono text-xs tabular-nums text-muted-400 whitespace-nowrap pl-1" role="status">
        {{ totalCount }} {{ totalCount === 1 ? 'clip' : 'clips' }}
      </div>
    </div>
  </div>
</template>
