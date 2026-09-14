<script setup lang="ts">
import { computed } from 'vue';
import { usePublisher } from '../../composables/usePublisher';
import { useClipsStore, CLIP_SORTS, type ClipSort } from '../../stores/clips';
import { Icon } from '@iconify/vue';

export type FilterType = 'videos' | 'starred' | 'published' | 'not-published';
export type ViewMode = 'grid' | 'grouped';

interface FilterOption {
  value: FilterType;
  label: string;
  icon: string;
}

interface Props {
  activeFilter: FilterType;
  viewMode: ViewMode;
  totalCount: number;
}

interface Emits {
  (e: 'update:active-filter', filter: FilterType): void;
  (e: 'update:view-mode', mode: ViewMode): void;
}

defineProps<Props>();
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
</script>

<template>
  <nav class="flex items-center gap-6 px-6 mt-6" aria-label="Filter clips">
    <button
      v-for="filter in filters"
      :key="filter.value"
      class="flex items-center gap-2 px-1 py-3 border-b-2 transition-colors font-medium"
      :class="activeFilter === filter.value 
        ? 'border-orange-500 text-orange-500' 
        : 'border-transparent text-muted-400 hover:text-foreground'"
      :aria-current="activeFilter === filter.value ? 'page' : undefined"
      @click="emit('update:active-filter', filter.value)"
    >
      <Icon :icon="filter.icon" />
      <span>{{ filter.label }}</span>
    </button>

    <div class="flex items-center gap-3 ml-auto self-end pb-2">
      <!--
        The library had no sort at all: newest first was the only order on
        offer. It sits beside the count because both describe the list you are
        looking at rather than changing what is in it.
      -->
      <label class="sr-only" for="clip-sort">Order the clips</label>
      <select
        id="clip-sort"
        class="text-sm bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground outline-none focus:border-orange-500/60"
        :value="clipsStore.sort"
        @change="clipsStore.setSort(($event.target as HTMLSelectElement).value as ClipSort)"
      >
        <option v-for="option in CLIP_SORTS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <div class="text-sm text-muted-400" role="status">
        {{ totalCount }} {{ totalCount === 1 ? 'clip' : 'clips' }}
      </div>
    </div>
  </nav>
</template>

