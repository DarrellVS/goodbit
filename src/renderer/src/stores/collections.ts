import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useConfiguration } from '../composables/useConfiguration';
import type { Collection } from '../types/collection';
import type { Clip } from '../types/clip';
import * as collectionsService from '../services/collections';
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
}

export const useCollectionsStore = defineStore('collections', () => {
  const items = ref<Collection[]>([]);
  const clipsStore = useClipsStore();
  const config = useConfiguration();
  
  const clipsState = ref<CollectionClipsState>({
    currentCollectionId: null,
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    loading: false,
    abortController: null,
    requestId: 0,
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
    clipsState.value.loading = true;

    try {
      const params: Record<string, string | number> = {
        page: clipsState.value.page,
        pageSize: config.public.value.pageSize,
      };

      if (clipsStore.selectedGame) params.game = clipsStore.selectedGame;
      if (clipsStore.searchText) params.q = clipsStore.searchText;
      if (clipsStore.selectedTags.length) params.tags = clipsStore.selectedTags.join(',');
      if (clipsStore.publishedFilter !== null) params.published = String(clipsStore.publishedFilter);
      if (clipsStore.starredFilter) params.starred = 'true';

      const result = await collectionsService.getCollectionClips(collectionId, params);

      if (currentRequestId === clipsState.value.requestId) {
        if (append) {
          clipsState.value.items = [...clipsState.value.items, ...result.items];
        } else {
          clipsState.value.items = result.items;
        }
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

  function resetCollectionClips(): void {
    clipsState.value.currentCollectionId = null;
    clipsState.value.page = 1;
    clipsState.value.items = [];
    clipsState.value.total = 0;
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
    hasNextPage,
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

