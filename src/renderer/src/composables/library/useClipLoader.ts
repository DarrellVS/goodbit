import { ref, type Ref } from 'vue';
import type { Clip } from '@renderer/types/clip';
import type { ClipMeta } from '@renderer/services/clips';
import { getClip, getClipMeta } from '@renderer/services/clips';

export function useClipLoader(clipId: Ref<number> | number) {
  const clip = ref<Clip | null>(null);
  const metadata = ref<ClipMeta | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function loadClip(): Promise<void> {
    const id = typeof clipId === 'number' ? clipId : clipId.value;
    loading.value = true;
    error.value = null;
    
    try {
      clip.value = await getClip(id);
      metadata.value = await getClipMeta(id);
    } catch (err: any) {
      console.error('Failed to load clip:', err);
      error.value = err?.response?.data?.error || 'Failed to load clip';
    } finally {
      loading.value = false;
    }
  }

  function handleClipUpdated(updatedClip: Clip | null): void {
    if (updatedClip) clip.value = updatedClip;
  }

  return {
    clip,
    metadata,
    loading,
    error,
    loadClip,
    handleClipUpdated,
  };
}

