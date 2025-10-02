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
        :title="router.currentRoute.value.meta.title as string"
        :subtitle="router.currentRoute.value.meta.subtitle as string"
        @rescan="rescan"
      >
        <template #tags-filter>
          <div class="flex flex-col gap-3 max-h-72 overflow-auto min-w-[280px]">
            <div class="text-sm font-semibold">Filter by Tags</div>
            <div v-if="tagsStore.items.length === 0" class="text-muted-400 text-sm py-4 text-center">No tags yet</div>
            <div v-else class="space-y-1">
              <div
                v-for="t in tagsStore.items"
                :key="t"
                class="flex items-center gap-2"
              >
                <button
                  class="flex-1 text-left rounded-lg border border-gray-200 px-3 py-2.5 bg-white/5 hover:bg-white/10 transition-colors"
                  :class="{ 'ring-2 ring-orange-500/50 bg-orange-500/10 border-orange-500/30': clipsStore.selectedTags.includes(t) }"
                  @click="clipsStore.setTags(clipsStore.selectedTags.includes(t) ? clipsStore.selectedTags.filter(x => x !== t) : [...clipsStore.selectedTags, t])"
                >
                  <span class="text-sm">#{{ t }}</span>
                  <span v-if="clipsStore.selectedTags.includes(t)" class="ml-2 text-xs text-orange-500 font-medium">✓</span>
                </button>
                <button
                  class="p-2 rounded-lg border border-gray-200 bg-white/5 hover:bg-red-500/20 hover:border-red-500/50 transition-colors group"
                  @click.stop="removeTagFromHeader(t)"
                  title="Delete tag"
                >
                  <Icon icon="material-symbols:delete" class="text-muted-400 group-hover:text-red-500 transition-colors" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </AppHeader>

      <main class="flex-1 overflow-y-auto">
        <RouterView />
      </main>
    </div>

    <!-- File Drop Zone Overlay -->
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
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { useAuthStore } from '../stores/auth';
import { useGamesStore } from '../stores/games';
import { useTagsStore } from '../stores/tags';
import { useToastStore } from '../stores/toast';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { useFileImport } from '../composables/useFileImport';
import AppHeader from '../components/App/AppHeader.vue';
import AppSidebar from '../components/App/AppSidebar.vue';
import FileDropZone from '../components/App/FileDropZone.vue';
import { deleteTag } from '../services/clips';
import { Icon } from '@iconify/vue';

const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const toastStore = useToastStore();
const clipsStore = useClipsStore();
const fileImport = useFileImport();
const selectedGame = ref('');
const searchText = ref('');
const isRescanLoading = ref(false);
const auth = useAuthStore();
const user = computed(() => auth.user);
const router = useRouter();

// Disable games filter on pages where it doesn't make sense
const disableGamesFilter = computed(() => {
  const routeName = router.currentRoute.value.name;
  return !(routeName === 'clips' || routeName === 'today' || routeName === 'collection');
});

function selectGame(g: string) {
  selectedGame.value = g;
}

async function rescan() {
  isRescanLoading.value = true;
  try {
    await rescanGames();
    clipsStore.resetPagination();
    await Promise.all([gamesStore.fetchGames(), clipsStore.fetchClips(false)]);
  } finally {
    isRescanLoading.value = false;
  }
}

async function logout() {
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

// Clear game filter when navigating to pages that don't support it
watch(disableGamesFilter, (isDisabled) => {
  if (isDisabled && selectedGame.value) {
    selectedGame.value = '';
    clipsStore.setGame('');
  }
});

async function removeTagFromHeader(tagName: string) {
  toastStore.confirm(
    `This will remove "${tagName}" from all clips.`,
    async () => {
      try {
        await deleteTag(tagName);
        
        const idx = tagsStore.items.indexOf(tagName);
        if (idx >= 0) tagsStore.items.splice(idx, 1);
        
        if (clipsStore.selectedTags.includes(tagName)) {
          clipsStore.setTags(clipsStore.selectedTags.filter(t => t !== tagName));
        }
        
        toastStore.success(`Tag "${tagName}" deleted successfully`);
      } catch (error) {
        console.error('Failed to delete tag:', error);
        toastStore.error('Please try again.', 'Failed to delete tag');
      }
    },
    'Delete tag?'
  );
}

// Global keyboard shortcuts
useKeyboardShortcuts({
  shortcuts: {
    KeyG: () => {
      if (router.currentRoute.value.name !== 'clips') {
        router.push('/');
      }
    },
    KeyS: () => {
      if (router.currentRoute.value.name !== 'settings') {
        router.push('/settings');
      }
    },
    Slash: (event) => {
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
