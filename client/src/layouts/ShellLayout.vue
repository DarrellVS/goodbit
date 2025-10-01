<template>
  <div class="h-full grid grid-rows-[72px_1fr] grid-cols-1">
    <AppHeader :search="searchText" :rescan-loading="isRescanLoading" :show-logout="!!user" @update:search="(v) => searchText = v" @rescan="rescan" @logout="logout">
      <template #tags-filter>
        <div class="flex flex-col gap-2 max-h-72 overflow-auto min-w-[240px] p-1">
          <button
            v-for="t in tagsStore.items"
            :key="t"
            class="text-left rounded-lg border border-border px-3 py-2 bg-white/5 hover:bg-white/10"
            :class="{ 'ring-2 ring-primary/50': clipsStore.selectedTags.includes(t) }"
            @click="clipsStore.setTags(clipsStore.selectedTags.includes(t) ? clipsStore.selectedTags.filter(x => x !== t) : [...clipsStore.selectedTags, t])"
          >
            <span>#{{ t }}</span>
            <span v-if="clipsStore.selectedTags.includes(t)" class="ml-2 text-xs text-primary">selected</span>
          </button>
        </div>
      </template>
    </AppHeader>

    <main class="p-0 pb-28 mx-auto">
      <RouterView />
    </main>
  </div>

  <AppFloatingFilter :items="gamesStore.items" :active="selectedGame" @select="selectGame" />
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
import AppFloatingFilter from '../components/App/AppFloatingFilter.vue';

const props = defineProps<{ hasSidebar: boolean }>();

const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const clipsStore = useClipsStore();
const selectedGame = ref('');
const searchText = ref('');
const isRescanLoading = ref(false);
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

// Floating filter moved into AppFloatingFilter, hover gating handled via composable there
</script>
