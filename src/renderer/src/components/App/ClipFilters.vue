<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { usePublisher } from '../../composables/usePublisher';
import { useClipsStore, CLIP_SORTS, type ClipSort } from '../../stores/clips';
import { useTagsStore } from '../../stores/tags';
import BaseComboBox from '../Base/BaseComboBox.vue';
import { COMBO_BOX_HEIGHT, type ComboBoxValue } from '../Base/types';
import { tagFilterOptions, tagFilterSelection, tagFilterSummary } from '../../utils/tagFilter';

/**
 * One row that describes the list below it, and chooses what to act on.
 *
 * Everything that narrows the library is here now. It used to be spread over
 * two rows and a popover: the tabs and the sort lived here, filtering by tag
 * was a button in the header beside the search field, and the *Select* button
 * was in a bar that floated over the clips whether or not anybody was
 * selecting. Three places for one question.
 *
 * Left to right: which clips, then what to do with them, then how they are
 * narrowed and ordered, then how many there are. The right hand group is all
 * `h-9` because `COMBO_BOX_HEIGHT` is not a prop: two controls of the same kind
 * at two heights is the thing `BaseComboBox` exists to stop.
 */
export type FilterType = 'videos' | 'starred' | 'published' | 'not-published';

interface FilterOption {
  value: FilterType;
  label: string;
  icon: string;
}

interface Props {
  activeFilter: FilterType;
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
}

interface Emits {
  (e: 'update:active-filter', filter: FilterType): void;
  (e: 'enter-selection'): void;
  (e: 'exit-selection'): void;
}

withDefaults(defineProps<Props>(), { isSelectionMode: false, sortable: true });
const emit = defineEmits<Emits>();

const allFilters: FilterOption[] = [
  { value: 'videos', label: 'Videos', icon: 'material-symbols:play-circle' },
  { value: 'starred', label: 'Starred', icon: 'material-symbols:star' },
  { value: 'published', label: 'Published', icon: 'material-symbols:check-circle' },
  { value: 'not-published', label: 'Not Published', icon: 'material-symbols:cancel' },
];

const { isConfigured: publisherConfigured } = usePublisher();

/**
 * The publish tabs only exist once publishing does.
 *
 * A filter for a state advertises the state. With no publisher set up these
 * counted and filtered a verb the app never offered, so people went looking
 * for a Publish button that would not have worked for them anyway.
 */
const filters = computed(() =>
  publisherConfigured.value ? allFilters : allFilters.filter((f) => !f.value.includes('published')),
);

const clipsStore = useClipsStore();
const tagsStore = useTagsStore();

const sortOptions = computed(() => CLIP_SORTS.map((sort) => ({ value: sort.value, label: sort.label })));

function onSortChange(value: ComboBoxValue | ComboBoxValue[] | null): void {
  if (value === null || Array.isArray(value)) return;
  clipsStore.setSort(value as ClipSort);
}

const tagOptions = computed(() => tagFilterOptions(tagsStore.items, clipsStore.selectedTags));

function onTagsChange(value: ComboBoxValue | ComboBoxValue[] | null): void {
  clipsStore.setTags(tagFilterSelection(value));
}
</script>

<template>
  <!--
    The hairline is the row's, and the tabs sit on it: `-mb-px` puts the active
    tab's own 2 px underline over the top of it rather than a pixel below.
  -->
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 pt-6">
    <nav class="flex items-center gap-6" aria-label="Filter clips">
      <button
        v-for="filter in filters"
        :key="filter.value"
        class="-mb-px flex items-center gap-2 border-b-2 px-1 py-3 font-medium transition-colors"
        :class="activeFilter === filter.value
          ? 'border-orange-500 text-orange-500'
          : 'border-transparent text-muted-400 hover:text-foreground'"
        :aria-current="activeFilter === filter.value ? 'page' : undefined"
        @click="emit('update:active-filter', filter.value)"
      >
        <Icon :icon="filter.icon" />
        <span>{{ filter.label }}</span>
      </button>
    </nav>

    <div class="ml-auto flex items-center gap-3">
      <!--
        Select is a toggle, which it did not have to be while the floating bar
        carried a Cancel of its own. That bar is only the batch toolbar now and
        the toolbar appears on a selection, so with nothing picked yet this is
        the only way out other than Esc.
      -->
      <button
        v-if="isSelectionMode"
        :class="[COMBO_BOX_HEIGHT, 'flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted-700 transition-colors hover:bg-muted-100']"
        title="Stop selecting (Esc)"
        @click="emit('exit-selection')"
      >
        <Icon icon="material-symbols:close" class="text-base" />
        <span>Cancel</span>
      </button>
      <button
        v-else
        :class="[COMBO_BOX_HEIGHT, 'flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted-100']"
        title="Pick clips to star, tag, publish, move or delete together (Ctrl+A for all of them)"
        @click="emit('enter-selection')"
      >
        <Icon icon="material-symbols:check-box-outline-blank" class="text-base" />
        <span>Select</span>
      </button>

      <div class="h-5 w-px bg-border"></div>

      <!--
        Multi-select, because two tags at once is the useful case and
        `GET /clips` requires all of the ones it is given. Searchable, because a
        library has dozens of tags; the sort has seven orders and does not want
        typing.
      -->
      <BaseComboBox
        class="w-40"
        label="Filter by tag"
        placeholder="Any tag"
        search-placeholder="Find a tag"
        empty-message="No tags yet. Tag a clip and it turns up here."
        multiple
        searchable
        :model-value="clipsStore.selectedTags"
        :options="tagOptions"
        :summary="tagFilterSummary"
        @update:model-value="onTagsChange"
      />

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

      <div class="text-sm text-muted-400" role="status">
        {{ totalCount }} {{ totalCount === 1 ? 'clip' : 'clips' }}
      </div>
    </div>
  </div>
</template>
