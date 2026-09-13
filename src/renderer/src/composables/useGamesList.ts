import { ref, computed } from 'vue';
import { useGamesStore } from '../stores/games';

const MAX_VISIBLE_ITEMS = 5;

export function useGamesList() {
  const gamesStore = useGamesStore();
  const showAllGames = ref(false);

  const games = computed(() => gamesStore.games());

  const visibleGames = computed(() => {
    return showAllGames.value ? games.value : games.value.slice(0, MAX_VISIBLE_ITEMS);
  });

  const hasMoreGames = computed(() => games.value.length > MAX_VISIBLE_ITEMS);

  return {
    games,
    visibleGames,
    hasMoreGames,
    showAllGames,
  };
}

