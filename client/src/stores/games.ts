import { defineStore } from 'pinia';
import axios from '../axios';

export type GameRow = { game: string; count: number };

export const useGamesStore = defineStore('games', {
  state: () => ({
    items: [] as GameRow[],
    loading: false,
  }),
  actions: {
    async fetchGames() {
      this.loading = true;
      try {
        const { data } = await axios.get<GameRow[]>('/api/games');
        this.items = data;
      } finally {
        this.loading = false;
      }
    },
  },
});


