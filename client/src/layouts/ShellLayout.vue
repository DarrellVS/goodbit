<template>
  <div class="h-full grid grid-cols-[256px_1fr] grid-rows-1">
    <AppSidebar :active-game="selectedGame" @logout="logout" @select-game="selectGame" />
    
    <div class="flex flex-col h-full overflow-hidden">
      <AppHeader :search="searchText" :rescan-loading="isRescanLoading" :active-filter="activeFilter" @update:search="(v) => searchText = v" @update:filter="(v) => activeFilter = v" @rescan="rescan">
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
                  class="flex-1 text-left rounded-lg border border-border/30 px-3 py-2.5 bg-white/5 hover:bg-white/10 transition-colors"
                  :class="{ 'ring-2 ring-orange-500/50 bg-orange-500/10 border-orange-500/30': clipsStore.selectedTags.includes(t) }"
                  @click="clipsStore.setTags(clipsStore.selectedTags.includes(t) ? clipsStore.selectedTags.filter(x => x !== t) : [...clipsStore.selectedTags, t])"
                >
                  <span class="text-sm">#{{ t }}</span>
                  <span v-if="clipsStore.selectedTags.includes(t)" class="ml-2 text-xs text-orange-500 font-medium">✓</span>
                </button>
                <button
                  class="p-2 rounded-lg border border-border/30 bg-white/5 hover:bg-red-500/20 hover:border-red-500/50 transition-colors group"
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
import AppHeader from '../components/App/AppHeader.vue';
import AppSidebar from '../components/App/AppSidebar.vue';
import { deleteTag } from '../services/clips';
import { Icon } from '@iconify/vue';

const props = defineProps<{ hasSidebar: boolean }>();

const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const clipsStore = useClipsStore();
const selectedGame = ref('');
const searchText = ref('');
const isRescanLoading = ref(false);
const activeFilter = ref('videos');
const auth = useAuthStore();
const user = computed(() => auth.user);
const router = useRouter();

function selectGame(g: string) {
  selectedGame.value = g;
}

async function rescan() {
  isRescanLoading.value = true;
  try {
    await rescanGames();
    await Promise.all([gamesStore.fetchGames(), clipsStore.fetchClips()]);
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
});

watch(selectedGame, (g) => {
  clipsStore.setGame(g);
});

watch(searchText, (q) => {
  clipsStore.setSearch(q);
});

watch(activeFilter, (filter) => {
  if (filter === 'published') {
    clipsStore.setPublishedFilter(true);
    clipsStore.setStarredFilter(false);
  } else if (filter === 'not-published') {
    clipsStore.setPublishedFilter(false);
    clipsStore.setStarredFilter(false);
  } else if (filter === 'starred') {
    clipsStore.setPublishedFilter(null);
    clipsStore.setStarredFilter(true);
  } else {
    clipsStore.setPublishedFilter(null);
    clipsStore.setStarredFilter(false);
  }
});

async function removeTagFromHeader(tagName: string) {
  if (!confirm(`Delete tag "${tagName}"?\n\nThis will remove it from all clips.`)) return;
  
  try {
    await deleteTag(tagName);
    
    // Remove from store
    const idx = tagsStore.items.indexOf(tagName);
    if (idx >= 0) tagsStore.items.splice(idx, 1);
    
    // If this tag was selected, remove it from the filter
    if (clipsStore.selectedTags.includes(tagName)) {
      clipsStore.setTags(clipsStore.selectedTags.filter(t => t !== tagName));
    }
  } catch (error) {
    console.error('Failed to delete tag:', error);
    alert('Failed to delete tag. Please try again.');
  }
}
</script>
