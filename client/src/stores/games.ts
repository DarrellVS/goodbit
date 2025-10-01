import { defineStore } from 'pinia';
import { fetchGames as fetchGamesService } from '../services/games';

export interface GameRow {
  game: string;
  count: number;
}

interface GamesState {
  items: GameRow[];
  loading: boolean;
}

export const useGamesStore = defineStore('games', {
  state: (): GamesState => ({
    items: [],
    loading: false,
  }),

  getters: {
    topGames: (state) => (limit: number = 5) => state.items.slice(0, limit),
    totalGames: (state) => state.items.length,
  },

  actions: {
    async fetchGames(): Promise<void> {
      this.loading = true;
      try {
        this.items = await fetchGamesService();
      } finally {
        this.loading = false;
      }
    },
  },
});


