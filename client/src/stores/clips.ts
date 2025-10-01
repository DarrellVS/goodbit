import { defineStore } from 'pinia';
import axios from '../axios';
import type { Clip } from '../types/clip';

interface ClipsState {
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
  selectedGame: string;
  searchText: string;
  selectedTags: string[];
  publishedFilter: boolean | null;
  starredFilter: boolean;
  loading: boolean;
}

interface ClipsResponse {
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
}

export const useClipsStore = defineStore('clips', {
  state: (): ClipsState => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 12,
    selectedGame: '',
    searchText: '',
    selectedTags: [],
    publishedFilter: null,
    starredFilter: false,
    loading: false,
  }),

  getters: {
    totalPages: (state) => Math.ceil(state.total / state.pageSize),
    hasNextPage: (state) => state.page < Math.ceil(state.total / state.pageSize),
    hasPreviousPage: (state) => state.page > 1,
  },

  actions: {
    async fetchClips(): Promise<void> {
      this.loading = true;
      try {
        const params: Record<string, string | number> = { 
          page: this.page, 
          pageSize: this.pageSize 
        };
        
        if (this.selectedGame) params.game = this.selectedGame;
        if (this.searchText) params.q = this.searchText;
        if (this.selectedTags.length) params.tags = this.selectedTags.join(',');
        if (this.publishedFilter !== null) params.published = String(this.publishedFilter);
        if (this.starredFilter) params.starred = 'true';

        const { data } = await axios.get<ClipsResponse>('/api/clips', { params });

        this.items = data.items;
        this.total = data.total;
      } finally {
        this.loading = false;
      }
    },

    updateClip(updatedClip: Clip): void {
      const index = this.items.findIndex(clip => clip.id === updatedClip.id);
      if (index !== -1) {
        this.items[index] = updatedClip;
      }
    },

    removeClip(clipId: number): void {
      const index = this.items.findIndex(clip => clip.id === clipId);
      if (index !== -1) {
        this.items.splice(index, 1);
        this.total--;
      }
    },

    setGame(game: string): void {
      this.selectedGame = game;
      this.page = 1;
      void this.fetchClips();
    },

    setSearch(query: string): void {
      this.searchText = query;
      this.page = 1;
      void this.fetchClips();
    },

    setTags(tags: string[]): void {
      this.selectedTags = tags;
      this.page = 1;
      void this.fetchClips();
    },

    setPublishedFilter(published: boolean | null): void {
      this.publishedFilter = published;
      this.page = 1;
      void this.fetchClips();
    },

    setStarredFilter(starred: boolean): void {
      this.starredFilter = starred;
      this.page = 1;
      void this.fetchClips();
    },

    goto(page: number): void {
      this.page = page;
      void this.fetchClips();
    },

    nextPage(): void {
      if (this.hasNextPage) {
        this.page++;
        void this.fetchClips();
      }
    },

    previousPage(): void {
      if (this.hasPreviousPage) {
        this.page--;
        void this.fetchClips();
      }
    },
  },
});


