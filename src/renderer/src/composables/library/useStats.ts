import { ref } from 'vue';
import axios from '@renderer/axios';

export interface GameStats {
  game: string;
  count: number;
  totalSize: number;
  avgSize: number;
  publishedCount: number;
  starredCount: number;
}

export interface Stats {
  totalClips: number;
  totalSize: number;
  publishedClips: number;
  starredClips: number;
  taggedClips: number;
  gamesCount: number;
  gameStats: GameStats[];
  clipsByDay: Array<{ date: string; count: number }>;
  avgClipSize: number;
  oldestClip: string | null;
  newestClip: string | null;
  mostUsedTags: Array<{ tag: string; count: number }>;
}

export function useStats() {
  const stats = ref<Stats | null>(null);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function fetchStats(): Promise<void> {
    loading.value = true;
    error.value = null;
    
    try {
      const { data } = await axios.get<Stats>('/api/stats');
      stats.value = data;
    } catch (err) {
      error.value = err as Error;
      console.error('Failed to load stats:', err);
    } finally {
      loading.value = false;
    }
  }

  return {
    stats,
    loading,
    error,
    fetchStats,
  };
}

