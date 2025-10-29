<template>
  <div 
    class="h-full grid grid-cols-[256px_1fr] grid-rows-1"
    @dragenter="fileImport.handleDragEnter"
    @dragleave="fileImport.handleDragLeave"
    @dragover="fileImport.handleDragOver"
    @drop="fileImport.handleDrop"
  >
    <AppSidebar 
      :active-game="selectedGame" 
      :disable-games-filter="disableGamesFilter"
      @logout="logout" 
      @select-game="selectGame" 
    />
    
    <div class="flex flex-col h-full overflow-hidden">
      <AppHeader 
        v-model:search="searchText" 
        :rescan-loading="isRescanLoading"
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

    <FileDropZone
      :is-dragging="fileImport.isDragging.value"
      :is-uploading="fileImport.isUploading.value"
      :upload-progress="fileImport.uploadProgress.value"
    />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch, computed } from 'vue';
import { rescanGames } from '../services/games';
import { RouterView, useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { useAuthStore } from '../stores/auth';
import { useGamesStore } from '../stores/games';
import { useTagsStore } from '../stores/tags';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { useFileImport } from '../composables/useFileImport';
import AppHeader from '../components/App/AppHeader.vue';
import AppSidebar from '../components/App/AppSidebar.vue';
import FileDropZone from '../components/App/FileDropZone.vue';
import AppTagsFilter from '../components/App/AppTagsFilter.vue';

const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const clipsStore = useClipsStore();
const fileImport = useFileImport();
const selectedGame = ref('');
const searchText = ref('');
const isRescanLoading = ref(false);
const auth = useAuthStore();
const user = computed(() => auth.user);
const router = useRouter();

const disableGamesFilter = computed(() => {
  const routeName = router.currentRoute.value.name;
  return !(routeName === 'clips' || routeName === 'today' || routeName === 'collection');
});

function selectGame(g: string): void {
  selectedGame.value = g;
}

async function rescan(): Promise<void> {
  isRescanLoading.value = true;
  try {
    await rescanGames();
    clipsStore.resetPagination();
    await Promise.all([gamesStore.fetchGames(), clipsStore.fetchClips(false)]);
  } finally {
    isRescanLoading.value = false;
  }
}

async function logout(): Promise<void> {
  await auth.logout();
  await router.push('/login');
}

onMounted(async () => {
  await Promise.all([gamesStore.fetchGames(), tagsStore.fetchTags()]);
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
