import { defineStore } from 'pinia';
import axios from '@renderer/axios';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import type { Clip } from '@renderer/types/clip';

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
  /** How the list is ordered. See `SORTS` in `routes/clips.ts`. */
  sort: ClipSort;
  loading: boolean;
  abortController: AbortController | null;
  requestId: number;
  /**
   * The filter signature the loaded list belongs to.
   *
   * `items` is a concatenation now, so "is this response still wanted" is no
   * longer the same question as "does this response belong to what is already
   * in the list". The request id answers the first; this answers the second.
   */
  loadedKey: string;
}

/**
 * The orders the library can be shown in.
 *
 * Kept in step with `SORTS` in `src/main/routes/clips.ts`; the server falls
 * back to newest for anything it does not know.
 */
export type ClipSort = 'newest' | 'oldest' | 'longest' | 'shortest' | 'largest' | 'smallest' | 'name';

export const CLIP_SORTS: ReadonlyArray<{ value: ClipSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'longest', label: 'Longest first' },
  { value: 'shortest', label: 'Shortest first' },
  { value: 'largest', label: 'Biggest file first' },
  { value: 'smallest', label: 'Smallest file first' },
  { value: 'name', label: 'Name, A to Z' },
];
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
    sort: 'newest',
    loading: false,
    abortController: null,
    requestId: 0,
    loadedKey: '',
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
    /**
     * Everything that decides *which* clips, and nothing that decides how many.
     *
     * The page is deliberately not in here: a second page of the same question
     * belongs on the end of the first. A different game, tag, search, state or
     * order is a different question and its answers may not be mixed in.
     */
    listKey: (state) =>
      JSON.stringify([
        state.selectedGame,
        state.searchText,
        [...state.selectedTags].sort(),
        state.publishedFilter,
        state.starredFilter,
        state.sort,
      ]),
    /** How many are on screen, against how many there are. */
    hasMore: (state): boolean => state.items.length < state.total,
  },

  actions: {
    async fetchClips(append = false): Promise<void> {
      /*
       * A fetch that replaces the list starts the list again.
       *
       * `page` used to survive, which was right while the library paged:
       * leaving and coming back put you on page three where you left off. With
       * a list that grows, `page` is the tail pointer of a concatenation, so a
       * stale one asks for the middle of the library, gets five clips from the
       * middle of it, and then `loadMore` walks off the end asking for pages
       * that are not there. Which is exactly what it did: ten clips of fifteen
       * and a Load more button that fetched nothing, for ever.
       */
      if (!append) this.page = 1;

      if (this.abortController) {
        this.abortController.abort();
      }

      this.abortController = new AbortController();
      this.requestId++;
      const currentRequestId = this.requestId;
      const askedFor = this.listKey;
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
        if (this.sort !== 'newest') params.sort = this.sort;

        const { data } = await axios.get<ClipsResponse>('/api/clips', {
          params,
          signal: this.abortController.signal
        });

        if (currentRequestId === this.requestId) {
          /*
           * Concatenate only onto the list this page belongs to.
           *
           * The request id says this response is the newest one asked for. It
           * does not say the list underneath is still the same list: a filter
           * change resets the page and starts its own fetch, and if a second
           * page was already in flight for the old filter the newest id can
           * belong to either. Appending on the strength of the id alone put
           * page two of one question under page one of another.
           */
          const ontoSameList = append && this.loadedKey === askedFor;
          this.items = ontoSameList ? [...this.items, ...data.items] : data.items;
          this.loadedKey = askedFor;

          /*
           * An empty page is the end, whatever the count says.
           *
           * `hasMore` compares what is loaded against the total, and those two
           * come from different moments: rows deleted between page one and
           * page three leave a total that promises clips the server no longer
           * has. Without this, the button sits there fetching nothing.
           */
          this.total = ontoSameList && data.items.length === 0 ? this.items.length : data.total;
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

    /** Re-order the whole library, which means starting again at page one. */
    setSort(sort: ClipSort): void {
      if (this.sort === sort) return;
      this.sort = sort;
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
    },

    /**
     * The next page, on the end of what is already there.
     *
     * The page number is bumped here rather than at the call site, and put
     * back if the request fails, because a page number ahead of the list is a
     * page of clips that is silently skipped the next time somebody scrolls.
     */
    async loadMore(): Promise<void> {
      if (this.loading || !this.hasMore) return;

      this.page++;
      try {
        await this.fetchClips(true);
      } catch (error) {
        this.page--;
        throw error;
      }
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


