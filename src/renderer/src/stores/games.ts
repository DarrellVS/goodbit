import { defineStore } from 'pinia';
import { fetchGames as fetchGamesService } from '@renderer/services/games';
import type { Game } from '@renderer/types/game';

export type GameRow = Game;

interface GamesState {
  items: Game[];
  loading: boolean;
}

export const useGamesStore = defineStore('games', {
  state: (): GamesState => ({
    items: [],
    loading: false,
  }),

  getters: {
    games: (state) => (limit: number = Infinity) => state.items.slice(0, limit),
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


