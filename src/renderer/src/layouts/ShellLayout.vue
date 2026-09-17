<template>
  <div
    class="h-full min-h-0 overflow-hidden grid grid-cols-[232px_1fr] grid-rows-1"
    @dragenter="fileImport.handleDragEnter"
    @dragleave="fileImport.handleDragLeave"
    @dragover="fileImport.handleDragOver"
    @drop="fileImport.handleDrop"
  >
    <Sidebar
      :active-game="selectedGame"
      :disable-games-filter="disableGamesFilter"
      @select-game="selectGame"
    />

    <div class="flex flex-col h-full overflow-hidden">
      <!--
        Why the library is empty, said above whatever screen you are on.

        It used to sit inside the library, under the filter row, which put a
        notice about the app's recording setup in the middle of a list of
        clips. Settings has the whole diagnostic and is the one screen that
        does not need it, since its Recording section is the diagnostic.
      -->
      <ObsNotReadyBanner v-if="router.currentRoute.value.name !== 'settings'" />

      <!--
        A screen gets a header when it asks for one, by carrying a `title` in
        its route meta. Settings does not: it is two columns and the right one
        already says which section it is showing. The editor does not either,
        and was drawing its own underneath this one.
      -->
      <PageHeader
        v-if="router.currentRoute.value.meta.title"
        v-model:search="searchText"
        :title="(router.currentRoute.value.meta.title as string)"
        :subtitle="(router.currentRoute.value.meta.subtitle as string)"
      />

      <main class="flex-1 overflow-y-auto">
        <RouterView />
      </main>
    </div>

    <!--
      One instance for the whole app, so a clip can be opened from the library,
      a collection or today's clips and land in the same layer over whichever
      of them you were looking at.
    -->
    <ClipDetailModal />
    <CollectionDetailModal />

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
import { RouterView, useRouter } from 'vue-router';
import ClipDetailModal from '@renderer/components/ClipDetail/ClipDetailModal.vue';
import CollectionDetailModal from '@renderer/components/Collection/CollectionDetailModal.vue';
import { useCollectionDetail } from '@renderer/composables/library/useCollectionDetail';
import { useClipsStore } from '@renderer/stores/clips';
import { useGamesStore } from '@renderer/stores/games';
import { useTagsStore } from '@renderer/stores/tags';
import { useKeyboardShortcuts } from '@renderer/composables/ui/useKeyboardShortcuts';
import { useFileImport } from '@renderer/composables/clips/useFileImport';
import PageHeader from '@renderer/components/Shell/PageHeader.vue';
import Sidebar from '@renderer/components/Shell/Sidebar.vue';
import ObsNotReadyBanner from '@renderer/components/Obs/ObsNotReadyBanner.vue';
import FileDropZone from '@renderer/components/Library/FileDropZone.vue';
import CommandPalette from '@renderer/components/Shell/CommandPalette.vue';
import { useServiceEvents } from '@renderer/composables/app/useServiceEvents';
import { usePublishProgress } from '@renderer/composables/clips/usePublishProgress';
import { useCollectionsStore } from '@renderer/stores/collections';
import { rememberScrollFor, restoreScrollFor } from '@renderer/utils/scroll';

const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const clipsStore = useClipsStore();
const fileImport = useFileImport();
const selectedGame = ref('');
const searchText = ref('');
const router = useRouter();

const { openCollectionId } = useCollectionDetail();

/*
 * The games list filters the clips, so it is live wherever clips are listed.
 * A collection is one of those places and used to be recognised by its route
 * name; it is a layer now, so the layer is what to ask.
 */
const disableGamesFilter = computed(() => {
  if (openCollectionId.value !== null) return false;
  const routeName = router.currentRoute.value.name;
  return !(routeName === 'clips' || routeName === 'today');
});

function selectGame(g: string): void {
  selectedGame.value = g;
}

const collectionsStore = useCollectionsStore();

// The watcher indexes clips while this window is open; without this the list
// shows whatever was there when it loaded.
useServiceEvents();

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
