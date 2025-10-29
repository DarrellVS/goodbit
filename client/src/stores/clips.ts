import { defineStore } from 'pinia';
import axios from '../axios';
import { useConfiguration } from '../composables/useConfiguration';
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
  abortController: AbortController | null;
  requestId: number;
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
    pageSize: 5,
    selectedGame: '',
    searchText: '',
    selectedTags: [],
    publishedFilter: null,
    starredFilter: false,
    loading: false,
    abortController: null,
    requestId: 0,
  }),

  getters: {
    totalPages: (state) => {
      const config = useConfiguration();
      return Math.ceil(state.total / config.public.value.pageSize);
    },
    hasNextPage: (state) => {
      const config = useConfiguration();
      return state.page < Math.ceil(state.total / config.public.value.pageSize);
    },
    hasPreviousPage: (state) => state.page > 1,
  },

  actions: {
    async fetchClips(append = false): Promise<void> {
      if (this.abortController) {
        this.abortController.abort();
      }

      this.abortController = new AbortController();
      this.requestId++;
      const currentRequestId = this.requestId;
      this.loading = true;

      const config = useConfiguration();

      try {
        const params: Record<string, string | number> = { 
          page: this.page,
          pageSize: config.public.value.pageSize 
        };
        
        if (this.selectedGame) params.game = this.selectedGame;
        if (this.searchText) params.q = this.searchText;
        if (this.selectedTags.length) params.tags = this.selectedTags.join(',');
        if (this.publishedFilter !== null) params.published = String(this.publishedFilter);
        if (this.starredFilter) params.starred = 'true';

        const { data } = await axios.get<ClipsResponse>('/api/clips', { 
          params,
          signal: this.abortController.signal
        });

        if (currentRequestId === this.requestId) {
          if (append) {
            this.items = [...this.items, ...data.items];
          } else {
            this.items = data.items;
          }
          this.total = data.total;
          this.abortController = null;
        }
      } catch (error) {
        if (axios.isCancel(error)) {
          return;
        }
        
        if (currentRequestId === this.requestId) {
          this.abortController = null;
          throw error;
        }
      } finally {
        if (currentRequestId === this.requestId) {
          this.loading = false;
        }
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
      void this.fetchClips(false);
    },

    setSearch(query: string): void {
      this.searchText = query;
      this.page = 1;
      void this.fetchClips(false);
    },

    setTags(tags: string[]): void {
      this.selectedTags = tags;
      this.page = 1;
      void this.fetchClips(false);
    },

    setPublishedFilter(published: boolean | null): void {
      if (this.publishedFilter === published) return;
      
      this.publishedFilter = published;
      this.page = 1;
      void this.fetchClips(false);
    },

    setStarredFilter(starred: boolean): void {
      if (this.starredFilter === starred) return;
      
      this.starredFilter = starred;
      this.page = 1;
      void this.fetchClips(false);
    },

    resetFilters(): void {
      this.selectedGame = '';
      this.searchText = '';
      this.selectedTags = [];
      this.publishedFilter = null;
      this.starredFilter = false;
      this.page = 1;
      void this.fetchClips(false);
    },

    resetPagination(): void {
      this.page = 1;
      this.items = [];
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


