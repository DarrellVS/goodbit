import { defineStore } from 'pinia';
import axios from '../axios';
import type { Clip } from '../types/clip';

export const useClipsStore = defineStore('clips', {
  state: () => ({
    items: [] as Clip[],
    total: 0,
    page: 1,
    pageSize: 12,
    selectedGame: '',
    searchText: '',
    selectedTags: [] as string[],
    publishedFilter: null as boolean | null, // null = all, true = published only, false = not published only
    loading: false,
  }),
  actions: {
    async fetchClips() {
      this.loading = true;
      try {
        const params: Record<string, string | number> = { page: this.page, pageSize: this.pageSize };
        
        if (this.selectedGame) params.game = this.selectedGame;
        if (this.searchText) params.q = this.searchText;
        if (this.selectedTags.length > 0) params.tags = this.selectedTags.join(',');
        if (this.publishedFilter !== null) params.published = String(this.publishedFilter);

        const { data } = await axios.get<{ items: Clip[]; total: number; page: number; pageSize: number }>(
          '/api/clips',
          { params }
        );

        this.items = data.items;
        this.total = data.total;
      } finally {
        this.loading = false;
      }
    },
    setGame(game: string) {
      this.selectedGame = game;
      this.page = 1;
      void this.fetchClips();
    },
    setSearch(q: string) {
      this.searchText = q;
      this.page = 1;
      void this.fetchClips();
    },
    setTags(tags: string[]) {
      this.selectedTags = tags;
      this.page = 1;
      void this.fetchClips();
    },
    setPublishedFilter(published: boolean | null) {
      this.publishedFilter = published;
      this.page = 1;
      void this.fetchClips();
    },
    goto(p: number) {
      this.page = p;
      void this.fetchClips();
    },
  },
});


