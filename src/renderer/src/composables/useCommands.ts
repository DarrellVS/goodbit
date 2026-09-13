import { computed, type ComputedRef } from 'vue';
import { useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useTagsStore } from '../stores/tags';
import { useCollectionsStore } from '../stores/collections';
import { useConfiguration } from './useConfiguration';

export interface Command {
  id: string;
  /** What it is called, in the words the buttons already use. */
  label: string;
  /** Where it lives, shown as a heading above it. */
  group: string;
  /** Extra words that should find it. */
  keywords?: string;
  icon?: string;
  run: () => void | Promise<void>;
}

/**
 * Everything the app can be asked to do, as one list.
 *
 * The discipline that makes this worth having: every entry calls the same code
 * as the button that does the same thing. Nothing here is new behaviour, so the
 * palette cannot drift away from the rest of the app as it changes.
 */
export function useCommands(): ComputedRef<Command[]> {
  const router = useRouter();
  const clipsStore = useClipsStore();
  const gamesStore = useGamesStore();
  const tagsStore = useTagsStore();
  const collectionsStore = useCollectionsStore();
  const config = useConfiguration();

  /** router.push resolves to a NavigationFailure union; a command returns nothing. */
  const go = (path: string) => () => {
    void router.push(path);
  };

  return computed(() => {
    const commands: Command[] = [
      {
        id: 'go-library',
        label: 'My Library',
        group: 'Go to',
        keywords: 'clips home browse',
        icon: 'material-symbols:video-library',
        run: go('/'),
      },
      {
        id: 'go-today',
        label: "Today's Clips",
        group: 'Go to',
        keywords: 'recent new',
        icon: 'material-symbols:today',
        run: go('/today'),
      },
      {
        id: 'go-stats',
        label: 'Statistics',
        group: 'Go to',
        keywords: 'numbers charts',
        icon: 'material-symbols:bar-chart',
        run: go('/stats'),
      },
      {
        id: 'go-editor',
        label: 'Editor',
        group: 'Go to',
        keywords: 'timeline montage make movie',
        icon: 'material-symbols:movie-edit',
        run: go('/editor'),
      },
      {
        id: 'go-tag-patterns',
        label: 'Smart Tag Patterns',
        group: 'Go to',
        keywords: 'automatic tagging rules',
        icon: 'material-symbols:label',
        run: go('/tag-patterns'),
      },
      {
        id: 'go-settings',
        label: 'Settings',
        group: 'Go to',
        keywords: 'preferences options config',
        icon: 'material-symbols:settings',
        run: go('/settings'),
      },
      {
        id: 'view-mode',
        label: `Switch to ${config.public.value.viewMode === 'grouped' ? 'flat list' : 'grouped'} view`,
        group: 'View',
        keywords: 'layout group flat',
        icon: 'material-symbols:view-list',
        run: () => {
          // The setting is a plain stored ref; writing it is what the Settings
          // screen does too.
          config.public.value.viewMode =
            config.public.value.viewMode === 'grouped' ? 'grid' : 'grouped';
        },
      },
      {
        id: 'clear-filters',
        label: 'Clear all filters',
        group: 'View',
        keywords: 'reset search tags game',
        icon: 'material-symbols:filter-alt-off',
        run: async () => {
          clipsStore.setTags([]);
          clipsStore.setSearch('');
          // An empty game is how the store spells "no game filter".
          clipsStore.setGame('');
          await router.push('/');
        },
      },
    ];

    // The library's own contents are commands too: jumping to a game or a
    // collection is what is wanted most often and takes the most clicks.
    for (const game of gamesStore.items) {
      commands.push({
        id: `game-${game.game}`,
        label: game.displayName || game.game,
        group: 'Game',
        keywords: game.game,
        icon: 'material-symbols:stadia-controller',
        run: async () => {
          clipsStore.setGame(game.game);
          await router.push('/');
        },
      });
    }

    for (const collection of collectionsStore.items) {
      commands.push({
        id: `collection-${collection.id}`,
        label: collection.name,
        group: 'Collection',
        icon: 'material-symbols:folder',
        run: go(`/collections/${collection.id}`),
      });
    }

    for (const tag of tagsStore.items) {
      commands.push({
        id: `tag-${tag.name}`,
        label: tag.name,
        group: 'Tag',
        keywords: 'filter label',
        icon: 'material-symbols:label',
        run: async () => {
          clipsStore.setTags([tag.name]);
          await router.push('/');
        },
      });
    }

    return commands;
  });
}

/**
 * Rank commands against what has been typed.
 *
 * A prefix match beats a word-start match, which beats a match anywhere — so
 * typing "set" puts Settings above anything that merely contains those letters.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;

  const scored: Array<{ command: Command; score: number }> = [];

  for (const command of commands) {
    const haystack = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
    const label = command.label.toLowerCase();

    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (new RegExp(`\\b${escapeRegExp(q)}`).test(label)) score = 1;
    else if (label.includes(q)) score = 2;
    else if (haystack.includes(q)) score = 3;

    if (score >= 0) scored.push({ command, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.command.label.localeCompare(b.command.label))
    .map((s) => s.command);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
