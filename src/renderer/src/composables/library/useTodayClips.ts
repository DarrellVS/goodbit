import { computed, onMounted } from 'vue';
import { useClipsStore } from '@renderer/stores/clips';

export function useTodayClips() {
  const clipsStore = useClipsStore();

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
    return clipsStore.items.filter(
      (clip) => new Date(clip.recordedAt ?? clip.fileModifiedAt) >= startOfDay,
    );
  });

  onMounted(() => {
    void clipsStore.fetchClips();
  });

  return {
    todayClips,
    clipsStore,
  };
}

