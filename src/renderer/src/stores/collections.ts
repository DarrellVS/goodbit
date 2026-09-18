import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import type { Collection } from '@renderer/types/collection';
import type { Clip } from '@renderer/types/clip';
import * as collectionsService from '@renderer/services/collections';
import { useClipsStore } from './clips';

interface CollectionClipsState {
  currentCollectionId: number | null;
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  abortController: AbortController | null;
  requestId: number;
  /** The filter signature the loaded list belongs to. See `stores/clips.ts`. */
  loadedKey: string;
}

export const useCollectionsStore = defineStore('collections', () => {
  const items = ref<Collection[]>([]);
  const clipsStore = useClipsStore();
  const config = useConfiguration();

  /**
   * Which games the open collection is narrowed to. Its own, not the library's.
   *
   * Everything else in the filter row is shared with the library on purpose: a
   * collection is a view of it, so a search or a tag typed in one is the same
   * question asked of the other. The game was shared too, and that one came
   * from the sidebar rather than from anything in the layer: opening a
   * collection while a game was picked showed the part of it recorded in that
   * game, with no sign of why, and the sidebar is behind a scrim so it could
   * not be the answer either. A collection is a list somebody put together by
   * hand and the whole of it is what they asked for.
   *
   * Emptied whenever a collection opens, so the layer always starts on all of
   * them; the popover inside it sets this and nothing else does.
   */
  const selectedGames = ref<string[]>([]);

  const clipsState = ref<CollectionClipsState>({
    currentCollectionId: null,
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    loading: false,
    abortController: null,
    requestId: 0,
    loadedKey: '',
  });

  async function fetchCollections(): Promise<void> {
    try {
      items.value = await collectionsService.getCollections();
    } catch (error) {
      console.error('Failed to fetch collections:', error);
    }
  }

  async function createCollection(name: string): Promise<Collection> {
    const collection = await collectionsService.createCollection(name);
    items.value.push(collection);
    return collection;
  }

  async function updateCollection(id: number, name: string): Promise<void> {
    const updated = await collectionsService.updateCollection(id, name);
    const index = items.value.findIndex(c => c.id === id);
    if (index !== -1) {
      items.value[index] = updated;
    }
  }

  async function deleteCollection(id: number): Promise<void> {
    await collectionsService.deleteCollection(id);
    items.value = items.value.filter(c => c.id !== id);
  }

  async function fetchCollectionClips(collectionId: number, append = false): Promise<void> {
    if (collectionId !== clipsState.value.currentCollectionId) {
      clipsState.value.currentCollectionId = collectionId;
      clipsState.value.page = 1;
      clipsState.value.items = [];
    }

    if (clipsState.value.abortController) {
      clipsState.value.abortController.abort();
    }

    clipsState.value.abortController = new AbortController();
    clipsState.value.requestId++;
    const currentRequestId = clipsState.value.requestId;
    const askedFor = collectionListKey(collectionId);
    clipsState.value.loading = true;

    try {
      const params: Record<string, string | number> = {
        page: clipsState.value.page,
        pageSize: config.public.value.pageSize,
      };

      if (selectedGames.value.length) params.games = selectedGames.value.join(',');
      if (clipsStore.searchText) params.q = clipsStore.searchText;
      if (clipsStore.selectedTags.length) params.tags = clipsStore.selectedTags.join(',');
      if (clipsStore.publishedFilter !== null) params.published = String(clipsStore.publishedFilter);
      if (clipsStore.starredFilter) params.starred = 'true';

      const result = await collectionsService.getCollectionClips(collectionId, params);

      if (currentRequestId === clipsState.value.requestId) {
        /*
         * Concatenate only onto the list this page belongs to.
         *
         * The request id says this is the newest response asked for; it does
         * not say the list underneath is still the same list. See the same
         * guard in `stores/clips.ts` for the sequence that gets it wrong.
         */
        const ontoSameList = append && clipsState.value.loadedKey === askedFor;
        clipsState.value.items = ontoSameList
          ? [...clipsState.value.items, ...result.items]
          : result.items;
        clipsState.value.loadedKey = askedFor;
        clipsState.value.total = result.total;
        clipsState.value.abortController = null;
      }
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED') {
        return;
      }

      if (currentRequestId === clipsState.value.requestId) {
        clipsState.value.abortController = null;
        throw error;
      }
    } finally {
      if (currentRequestId === clipsState.value.requestId) {
        clipsState.value.loading = false;
      }
    }
  }

  function setGames(games: string[]): void {
    selectedGames.value = games;
    clipsState.value.page = 1;
    if (clipsState.value.currentCollectionId !== null) {
      void fetchCollectionClips(clipsState.value.currentCollectionId, false);
    }
  }

  /**
   * The same patch as the clips store's, for the collection layer's own list.
   *
   * It holds its own rows, so a clip analysed while a collection is open would
   * otherwise keep the card it was fetched with.
   */
  function setSuggestedCount(clipId: number, suggestedCount: number): void {
    const clip = clipsState.value.items.find((row) => row.id === clipId);
    if (clip) clip.suggestedCount = suggestedCount;
  }

  function resetCollectionClips(): void {
    clipsState.value.currentCollectionId = null;
    clipsState.value.page = 1;
    clipsState.value.items = [];
    clipsState.value.total = 0;
  }

  /** Everything that decides which clips, including which collection. */
  function collectionListKey(collectionId: number): string {
    return JSON.stringify([
      collectionId,
      [...selectedGames.value].sort(),
      clipsStore.searchText,
      [...clipsStore.selectedTags].sort(),
      clipsStore.publishedFilter,
      clipsStore.starredFilter,
    ]);
  }

  /** More than what is on screen. */
  const hasMoreClips = computed(
    () => clipsState.value.items.length < clipsState.value.total,
  );

  /**
   * The next page, on the end of this one.
   *
   * The page number is put back if the request fails, because a page number
   * ahead of the list is a page of clips silently skipped next time.
   */
  async function loadMoreClips(): Promise<void> {
    const id = clipsState.value.currentCollectionId;
    if (id === null || clipsState.value.loading || !hasMoreClips.value) return;

    clipsState.value.page++;
    try {
      await fetchCollectionClips(id, true);
    } catch (error) {
      clipsState.value.page--;
      throw error;
    }
  }

  const hasNextPage = computed(() => {
    const totalPages = Math.ceil(clipsState.value.total / config.public.value.pageSize);
    return clipsState.value.page < totalPages;
  });

  const hasPreviousPage = computed(() => {
    return clipsState.value.page > 1;
  });

  const totalPages = computed(() => {
    return Math.ceil(clipsState.value.total / config.public.value.pageSize);
  });

  function gotoPage(page: number): void {
    if (clipsState.value.currentCollectionId !== null) {
      clipsState.value.page = page;
      void fetchCollectionClips(clipsState.value.currentCollectionId, false);
    }
  }

  function nextPage(): void {
    if (hasNextPage.value && clipsState.value.currentCollectionId !== null) {
      clipsState.value.page++;
      void fetchCollectionClips(clipsState.value.currentCollectionId, false);
    }
  }

  function previousPage(): void {
    if (hasPreviousPage.value && clipsState.value.currentCollectionId !== null) {
      clipsState.value.page--;
      void fetchCollectionClips(clipsState.value.currentCollectionId, false);
    }
  }

  async function addClipToCollection(collectionId: number, clipId: number): Promise<void> {
    const updated = await collectionsService.addClipToCollection(collectionId, clipId);
    const index = items.value.findIndex(c => c.id === collectionId);
    if (index !== -1) {
      items.value[index] = updated;
    }
  }

  async function removeClipFromCollection(collectionId: number, clipId: number): Promise<void> {
    const updated = await collectionsService.removeClipFromCollection(collectionId, clipId);
    const index = items.value.findIndex(c => c.id === collectionId);
    if (index !== -1) {
      items.value[index] = updated;
    }
    clipsState.value.items = clipsState.value.items.filter(c => c.id !== clipId);
    clipsState.value.total = Math.max(0, clipsState.value.total - 1);
  }

  const collections = computed(() => items.value);

  return {
    items,
    collections,
    clipsState,
    selectedGames,
    setGames,
    setSuggestedCount,
    hasNextPage,
    hasMoreClips,
    loadMoreClips,
    hasPreviousPage,
    totalPages,
    fetchCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    fetchCollectionClips,
    resetCollectionClips,
    gotoPage,
    nextPage,
    previousPage,
    addClipToCollection,
    removeClipFromCollection,
  };
});

