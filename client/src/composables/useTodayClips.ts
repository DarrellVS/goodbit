import { computed, onMounted } from 'vue';
import { useClipsStore } from '../stores/clips';

export function useTodayClips() {
  const clipsStore = useClipsStore();

  const todayClips = computed(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return clipsStore.items.filter(clip => new Date(clip.fileModifiedAt) >= startOfDay);
  });

  onMounted(() => {
    void clipsStore.fetchClips();
  });

  return {
    todayClips,
    clipsStore,
  };
}

