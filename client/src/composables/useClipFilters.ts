import { ref, watch } from 'vue';
import { useClipsStore } from '../stores/clips';
import type { FilterType } from '../components/App/ClipFilters.vue';

export function useClipFilters() {
  const clipsStore = useClipsStore();
  const activeFilter = ref<FilterType>('videos');

  function applyFilter(filter: FilterType, oldFilter?: FilterType): void {
    if (filter === oldFilter) return;

    const updates: Array<() => void> = [];
    
    switch (filter) {
      case 'published':
        updates.push(() => clipsStore.setPublishedFilter(true));
        updates.push(() => clipsStore.setStarredFilter(false));
        break;
      case 'not-published':
        updates.push(() => clipsStore.setPublishedFilter(false));
        updates.push(() => clipsStore.setStarredFilter(false));
        break;
      case 'starred':
        updates.push(() => clipsStore.setPublishedFilter(null));
        updates.push(() => clipsStore.setStarredFilter(true));
        break;
      default:
        updates.push(() => clipsStore.setPublishedFilter(null));
        updates.push(() => clipsStore.setStarredFilter(false));
    }

    updates.forEach(update => update());
  }

  watch(activeFilter, (newValue, oldValue) => {
    applyFilter(newValue, oldValue);
  }, { immediate: false });

  return {
    activeFilter,
  };
}

