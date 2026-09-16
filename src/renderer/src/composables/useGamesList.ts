import { computed, ref } from 'vue';
import { useGamesStore } from '../stores/games';

/**
 * How many games the sidebar shows before "Show N more".
 *
 * Exported because `SidebarGames.vue` also has to tell the "Show N more"
 * control how many are already on screen, and it had this number written out
 * a second time as a literal. Two copies of a count that appears in a label
 * is how "Show 25 more" ends up off by however far they have drifted.
 */
export const MAX_VISIBLE_GAMES = 10;

/**
 * Above this many games, scrolling a list is worse than typing a name, which
 * is the situation at 47 of them.
 */
const SEARCH_APPEARS_AT = 8;

export function useGamesList() {
  const gamesStore = useGamesStore();

  const showAllGames = ref(false);
  const search = ref('');

  const games = computed(() => gamesStore.games());

  const showSearch = computed(() => games.value.length >= SEARCH_APPEARS_AT);

  const matching = computed(() => {
    const query = search.value.trim().toLowerCase();
    if (!query) return games.value;

    return games.value.filter((game) =>
      `${game.displayName ?? ''} ${game.game}`.toLowerCase().includes(query),
    );
  });

  const visibleGames = computed(() => {
    // A search is already a filter; capping its results as well would hide
    // exactly the match someone typed for.
    if (search.value.trim()) return matching.value;
    return showAllGames.value ? matching.value : matching.value.slice(0, MAX_VISIBLE_GAMES);
  });

  const hasMoreGames = computed(
    () => !search.value.trim() && matching.value.length > MAX_VISIBLE_GAMES,
  );

  return {
    games,
    matching,
    visibleGames,
    hasMoreGames,
    showAllGames,
    search,
    showSearch,
  };
}
