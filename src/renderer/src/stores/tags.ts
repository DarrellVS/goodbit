import { defineStore } from 'pinia';
import { listAllTags } from '@renderer/services/clips';
import type { Tag } from '@renderer/types/tag';

export const useTagsStore = defineStore('tags', {
  state: () => ({
    items: [] as Tag[],
    loading: false,
  }),
  getters: {
    // Helper getter to get tag names as strings (for backward compatibility)
    tagNames: (state) => state.items.map(t => t.name),
  },
  actions: {
    async fetchTags() {
      if (this.loading) return;
      this.loading = true;
      try {
        this.items = await listAllTags();
      } finally {
        this.loading = false;
      }
    },
  },
});


