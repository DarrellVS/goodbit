<script setup lang="ts">
import { Icon } from '@iconify/vue';
import ViewModeToggle from './ViewModeToggle.vue';

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

const filters: FilterOption[] = [
  { value: 'videos', label: 'Videos', icon: 'material-symbols:play-circle' },
  { value: 'starred', label: 'Starred', icon: 'material-symbols:star' },
  { value: 'published', label: 'Published', icon: 'material-symbols:check-circle' },
  { value: 'not-published', label: 'Not Published', icon: 'material-symbols:cancel' },
];
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

    <div class="flex items-center gap-3 ml-auto self-end">
      <div class="text-sm text-muted-400" role="status">
        {{ totalCount }} Videos
      </div>
      
      <ViewModeToggle :model-value="viewMode" @update:model-value="emit('update:view-mode', $event)" />

      <!-- Custom actions slot -->
      <slot name="actions" />
    </div>
  </nav>
</template>

