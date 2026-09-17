import { computed, onMounted, ref } from 'vue';
import { listClips } from '@renderer/services/clips';
import { useClipsStore } from '@renderer/stores/clips';
import type { Clip } from '@renderer/types/clip';

/**
 * Today, on its own terms.
 *
 * This used to filter `clipsStore.items`, which is whatever the library last
 * fetched: one page of it, narrowed by whatever game, tag, search and state
 * filters were set on the screen you came from. So a screen called Today
 * showed today's clips *within the current page of the filtered library*,
 * which is neither everything nor today, and changed depending on where you
 * had been. It asks for its own list now, unfiltered.
 */
export function useTodayClips() {
  const clipsStore = useClipsStore();
  const items = ref<Clip[]>([]);
  const loading = ref(true);

  /**
   * What was recorded today, by the same date the library groups on.
   *
   * `fileModifiedAt` follows the file, so a clip trimmed this afternoon looked
   * like it was recorded this afternoon and appeared here whatever day it came
   * from. `recordedAt` is set once, when the file is first seen.
   */
  const todayClips = computed(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return items.value.filter(
      (clip) => new Date(clip.recordedAt ?? clip.fileModifiedAt) >= startOfDay,
    );
  });

  /*
   * Newest first and a generous page, then filtered to today here.
   *
   * `GET /clips` has no date filter, so the day has to be cut client side.
   * The endpoint's default order is newest first, so a page of 200 holds
   * every clip from today unless somebody records two hundred in one day.
   */
  onMounted(async () => {
    loading.value = true;
    try {
      const answer = await listClips({ page: 1, pageSize: 200 });
      items.value = answer.items;
    } finally {
      loading.value = false;
    }
  });

  return {
    todayClips,
    loading,
    clipsStore,
  };
}

