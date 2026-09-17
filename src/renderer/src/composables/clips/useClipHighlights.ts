import { ref } from 'vue';
import { getClipSuggestions, type ClipSuggestions } from '@renderer/services/clips';

/**
 * What the analysis thinks is worth keeping, per library clip.
 *
 * The Trim page asks the same question about one clip at a time; the editor has
 * a whole timeline of them, so answers are cached for the life of the page and
 * every clip is asked at most once. The main process caches to disk on top of
 * that, keyed by the file's mtime, so a second visit costs nothing.
 */
export function useClipHighlights() {
  const cache = ref(new Map<number, ClipSuggestions | null>());
  const pending = new Map<number, Promise<ClipSuggestions | null>>();
  const loading = ref(0);

  /** The cached answer, or undefined if this clip has not been asked yet. */
  function get(clipId: number): ClipSuggestions | null | undefined {
    return cache.value.get(clipId);
  }

  /** True once this clip has a window worth offering. */
  function hasHighlight(clipId: number): boolean {
    const found = cache.value.get(clipId);
    return Boolean(found?.confident && found.window);
  }

  async function load(clipId: number): Promise<ClipSuggestions | null> {
    const cached = cache.value.get(clipId);
    if (cached !== undefined) return cached;

    const inFlight = pending.get(clipId);
    if (inFlight) return inFlight;

    loading.value++;
    const request = getClipSuggestions(clipId)
      .catch(() => null)
      .then((result) => {
        // Reassigning the Map is what makes a template reading get() update.
        cache.value = new Map(cache.value).set(clipId, result);
        return result;
      })
      .finally(() => {
        pending.delete(clipId);
        loading.value--;
      });

    pending.set(clipId, request);
    return request;
  }

  /**
   * Ask about several clips at once, a few at a time.
   *
   * Each listen spawns an ffmpeg, so a day of thirty clips fired off together
   * would fight for the same disk and CPU; four in flight keeps it busy without
   * making the app unresponsive.
   */
  async function loadMany(clipIds: number[], concurrency = 4): Promise<void> {
    const queue = clipIds.filter((id) => cache.value.get(id) === undefined && !pending.has(id));
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (cursor < queue.length) {
        const id = queue[cursor++];
        await load(id);
      }
    });

    await Promise.all(workers);
  }

  return { get, hasHighlight, load, loadMany, loading };
}
