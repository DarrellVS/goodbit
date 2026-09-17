import { ref, watch, computed } from 'vue';
import { useClipsStore } from '@renderer/stores/clips';
import type { FilterType } from '@renderer/components/Library/ClipFilters.vue';

export function useClipFilters() {
  const clipsStore = useClipsStore();
  
  const derivedFilter = computed<FilterType>(() => {
    if (clipsStore.starredFilter) return 'starred';
    if (clipsStore.publishedFilter === true) return 'published';
    if (clipsStore.publishedFilter === false) return 'not-published';
    return 'videos';
  });

  const activeFilter = ref<FilterType>(derivedFilter.value);

  watch(derivedFilter, (newValue) => {
    activeFilter.value = newValue;
  });

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

