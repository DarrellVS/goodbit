import { ref, watch } from 'vue';
import { useClipsStore } from '../stores/clips';
import type { FilterType } from '../components/App/ClipFilters.vue';

export function useClipFilters() {
  const clipsStore = useClipsStore();
  const activeFilter = ref<FilterType>('videos');

  function applyFilter(filter: FilterType): void {
    switch (filter) {
      case 'published':
        clipsStore.setPublishedFilter(true);
        clipsStore.setStarredFilter(false);
        break;
      case 'not-published':
        clipsStore.setPublishedFilter(false);
        clipsStore.setStarredFilter(false);
        break;
      case 'starred':
        clipsStore.setPublishedFilter(null);
        clipsStore.setStarredFilter(true);
        break;
      default:
        clipsStore.setPublishedFilter(null);
        clipsStore.setStarredFilter(false);
    }
  }

  watch(activeFilter, applyFilter);

  return {
    activeFilter,
  };
}

