import { computed, ref, watch } from 'vue';
import { listClips } from '../services/clips';
import type { Clip } from '../types/clip';

/**
 * The editor's own view of the clip library.
 *
 * Deliberately not the `clips` store: the editor filters and pages
 * independently, and reusing the store would drag the library page's filters,
 * paging and scroll position around behind the user's back.
 */

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 250;

export function useEditorClipLibrary() {
  const clips = ref<Clip[]>([]);
  const total = ref(0);
  const loading = ref(false);

  const search = ref('');
  const selectedGame = ref('');
  const selectedTags = ref<string[]>([]);

  const page = ref(1);
  const hasMore = computed(() => clips.value.length < total.value);
  const hasFilters = computed(
    () => search.value !== '' || selectedGame.value !== '' || selectedTags.value.length > 0
  );

  // Abort-and-requestId, same as the stores: a slow response for filters the
  // user already moved on from must not overwrite a newer one.
  let controller: AbortController | null = null;
  let requestId = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  async function fetchClips(append = false): Promise<void> {
    controller?.abort();
    controller = new AbortController();

    const id = ++requestId;
    loading.value = true;

    try {
      const result = await listClips(
        {
          page: page.value,
          pageSize: PAGE_SIZE,
          game: selectedGame.value || undefined,
          q: search.value || undefined,
          tags: selectedTags.value,
        },
        controller.signal
      );

      if (id !== requestId) return;

      clips.value = append ? [...clips.value, ...result.items] : result.items;
      total.value = result.total;
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_CANCELED') return;
      console.error('Failed to load clips for the editor library:', error);
    } finally {
      if (id === requestId) loading.value = false;
    }
  }

  function reload(): void {
    page.value = 1;
    void fetchClips(false);
  }

  function loadMore(): void {
    if (loading.value || !hasMore.value) return;
    page.value += 1;
    void fetchClips(true);
  }

  function toggleTag(name: string): void {
    selectedTags.value = selectedTags.value.includes(name)
      ? selectedTags.value.filter((tag) => tag !== name)
      : [...selectedTags.value, name];
  }

  function clearFilters(): void {
    search.value = '';
    selectedGame.value = '';
    selectedTags.value = [];
  }

  watch(search, () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(reload, SEARCH_DEBOUNCE_MS);
  });

  watch([selectedGame, selectedTags], reload);

  return {
    clips,
    total,
    loading,
    search,
    selectedGame,
    selectedTags,
    hasMore,
    hasFilters,
    fetchClips,
    reload,
    loadMore,
    toggleTag,
    clearFilters,
  };
}
