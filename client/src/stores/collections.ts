import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Collection } from '../types/collection';
import type { Clip } from '../types/clip';
import * as collectionsService from '../services/collections';

export const useCollectionsStore = defineStore('collections', () => {
  const items = ref<Collection[]>([]);
  const loading = ref(false);
  const currentCollectionClips = ref<Clip[]>([]);

  async function fetchCollections(): Promise<void> {
    loading.value = true;
    try {
      items.value = await collectionsService.getCollections();
    } finally {
      loading.value = false;
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

  async function fetchCollectionClips(id: number): Promise<Clip[]> {
    loading.value = true;
    try {
      currentCollectionClips.value = await collectionsService.getCollectionClips(id);
      return currentCollectionClips.value;
    } finally {
      loading.value = false;
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
    currentCollectionClips.value = currentCollectionClips.value.filter(c => c.id !== clipId);
  }

  return {
    items,
    loading,
    currentCollectionClips,
    fetchCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    fetchCollectionClips,
    addClipToCollection,
    removeClipFromCollection,
  };
});

