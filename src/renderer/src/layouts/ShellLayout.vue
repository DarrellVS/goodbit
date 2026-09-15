<template>
  <div 
    class="h-full min-h-0 overflow-hidden grid grid-cols-[256px_1fr] grid-rows-1"
    @dragenter="fileImport.handleDragEnter"
    @dragleave="fileImport.handleDragLeave"
    @dragover="fileImport.handleDragOver"
    @drop="fileImport.handleDrop"
  >
    <AppSidebar 
      :active-game="selectedGame" 
      :disable-games-filter="disableGamesFilter" 
      @select-game="selectGame" 
    />
    
    <div class="flex flex-col h-full overflow-hidden">
      <AppHeader 
        v-model:search="searchText" 
        :rescan-loading="isRescanLoading || scanning"
        :title="(router.currentRoute.value.meta.title as string)"
        :subtitle="(router.currentRoute.value.meta.subtitle as string)"
        @rescan="rescan"
      >
        <template #tags-filter>
          <AppTagsFilter
            :tags="tagsStore.items"
            :selected-tags="clipsStore.selectedTags"
            @update:selected-tags="clipsStore.setTags"
          />
        </template>
      </AppHeader>

      <main class="flex-1 overflow-y-auto">
        <RouterView />
      </main>
    </div>

    <CommandPalette v-model:open="showCommandPalette" />

    <FileDropZone
      :is-dragging="fileImport.isDragging.value"
      :is-uploading="fileImport.isUploading.value"
      :upload-progress="fileImport.uploadProgress.value"
    />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue';
import { rescanGames } from '../services/games';
import { RouterView, useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { useGamesStore } from '../stores/games';
import { useTagsStore } from '../stores/tags';
import { useToastStore } from '../stores/toast';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { useFileImport } from '../composables/useFileImport';
import AppHeader from '../components/App/AppHeader.vue';
import AppSidebar from '../components/App/AppSidebar.vue';
import FileDropZone from '../components/App/FileDropZone.vue';
import AppTagsFilter from '../components/App/AppTagsFilter.vue';
import CommandPalette from '../components/App/CommandPalette.vue';
import { useServiceEvents } from '../composables/useServiceEvents';
import { usePublishProgress } from '../composables/usePublishProgress';
import { useCollectionsStore } from '../stores/collections';
import { rememberScrollFor, restoreScrollFor } from '../utils/scroll';

const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const clipsStore = useClipsStore();
const toastStore = useToastStore();
const fileImport = useFileImport();
const selectedGame = ref('');
const searchText = ref('');
const isRescanLoading = ref(false);
const router = useRouter();

const disableGamesFilter = computed(() => {
  const routeName = router.currentRoute.value.name;
  return !(routeName === 'clips' || routeName === 'today' || routeName === 'collection');
});

function selectGame(g: string): void {
  selectedGame.value = g;
}

/**
 * Re-read the videos folder, and say what came of it.
 *
 * This used to spin the icon and stop. A scan that found nothing looked exactly
 * like a scan that never ran, and because there was no `catch`, so did one that
 * threw. On a screen full of recordings somebody cannot replace, the loudest
 * button in the app has to report back.
 */
async function rescan(): Promise<void> {
  isRescanLoading.value = true;
  try {
    const result = await rescanGames();
    clipsStore.resetPagination();
    await Promise.all([gamesStore.fetchGames(), clipsStore.fetchClips(false)]);

    const clips = (n: number): string => `${n} clip${n === 1 ? '' : 's'}`;

    // The guard fired, which means the folder looked wrong rather than empty.
    // Nothing was deleted, and that is the part worth saying out loud.
    if (result.pruneSkipped) {
      toastStore.warning(
        `Nothing was removed, because ${result.pruneSkipped.reason}. Your library is untouched.`,
        'Scanned, but something looks off',
      );
      return;
    }

    const changes: string[] = [];
    if (result.added) changes.push(`${clips(result.added)} added`);
    if (result.updated) changes.push(`${clips(result.updated)} updated`);
    if (result.removed) changes.push(`${clips(result.removed)} no longer on disk`);

    /*
     * The number the screen is showing, not the number in the table.
     *
     * The scan counted every row and the library header counts what is on
     * screen, so a library with hidden games had the two disagreeing by
     * exactly the hidden count, with nothing saying why. The visible figure
     * leads, and the hidden ones are named rather than folded in.
     */
    const visible = result.total - (result.hidden ?? 0);
    const tally = result.hidden
      ? `${clips(visible)}, and ${clips(result.hidden)} in hidden games.`
      : `${clips(result.total)} in all.`;

    toastStore.success(
      changes.length ? `${changes.join(', ')}. ${tally}` : `Nothing new. ${tally}`,
      'Scanned',
    );
  } catch (error) {
    toastStore.error(
      (error as Error).message || 'The videos folder could not be read.',
      'Could not scan',
    );
  } finally {
    isRescanLoading.value = false;
  }
}


const collectionsStore = useCollectionsStore();

// The watcher indexes clips while this window is open; without this the list
// shows whatever was there when it loaded.
const { scanning } = useServiceEvents();

// Publishing narrates itself in a toast that stays put; mounted here so a
// publish started in the library is still reported after navigating away.
usePublishProgress();
const showCommandPalette = ref(false);

/**
 * Ctrl+K gets its own listener.
 *
 * The shortcut registry matches on `event.code` alone with no notion of
 * modifiers, so registering this there would fire on a bare K as well.
 */
function handlePaletteKey(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  if (event.code !== 'KeyK') return;
  event.preventDefault();
  showCommandPalette.value = !showCommandPalette.value;
}

/*
 * Every screen remembers where it was scrolled to.
 *
 * Leaving the library for Settings and coming back used to land at the top,
 * which after scrolling through several weeks of recordings means doing the
 * whole journey again.
 */
router.beforeEach((_to, from) => {
  rememberScrollFor(from.fullPath);
  return true;
});

router.afterEach((to) => {
  restoreScrollFor(to.fullPath);
});

onMounted(() => document.addEventListener('keydown', handlePaletteKey));
onBeforeUnmount(() => document.removeEventListener('keydown', handlePaletteKey));

onMounted(async () => {
  // The palette offers collections as well as games and tags, so they have to
  // be loaded for it to find them.
  await Promise.all([gamesStore.fetchGames(), tagsStore.fetchTags(), collectionsStore.fetchCollections()]);
  selectedGame.value = clipsStore.selectedGame;
});

watch(selectedGame, (g) => {
  clipsStore.setGame(g);
});

watch(() => clipsStore.selectedGame, (g) => {
  selectedGame.value = g;
});

watch(searchText, (q) => {
  clipsStore.setSearch(q);
});

watch(disableGamesFilter, (isDisabled) => {
  if (isDisabled && selectedGame.value) {
    selectedGame.value = '';
    clipsStore.setGame('');
  }
});

useKeyboardShortcuts({
  actions: {
    'nav-library': () => {
      if (router.currentRoute.value.name !== 'clips') {
        router.push('/');
      }
    },
    'nav-settings': () => {
      if (router.currentRoute.value.name !== 'settings') {
        router.push('/settings');
      }
    },
    'focus-search': (event) => {
      event.preventDefault();
      const searchInput = document.getElementById('global-search-input') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    },
  },
});
</script>
