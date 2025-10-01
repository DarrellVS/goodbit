import { defineStore } from 'pinia';
import { listAllTags } from '../services/clips';

export const useTagsStore = defineStore('tags', {
  state: () => ({
    items: [] as string[],
    loading: false,
  }),
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


