import { defineStore } from 'pinia';
import { fetchGames as fetchGamesService } from '../services/games';

export type GameRow = { game: string; count: number };

export const useGamesStore = defineStore('games', {
  state: () => ({
    items: [] as GameRow[],
    loading: false,
  }),
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


