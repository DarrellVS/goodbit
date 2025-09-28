<template>
  <div class="h-full grid grid-cols-[64px_300px_1fr] grid-rows-[72px_1fr]">
    <nav class="row-span-2 glass border-r border-border flex flex-col items-center gap-4 py-6">
      <RouterLink class="btn btn-ghost" to="/">🎞️</RouterLink>
      <RouterLink class="btn btn-ghost" to="/settings">⚙️</RouterLink>
    </nav>

    <header class="col-span-2 glass border-b border-border flex items-center justify-between px-6">
      <h1 class="text-2xl font-semibold">Clips</h1>
      <div class="flex items-center gap-3">
        <input class="input w-96" v-model="searchText" placeholder="Search name or filename" />
        <button class="btn" @click="rescan" :disabled="loading">Rescan</button>
      </div>
    </header>

    <aside class="glass border-r border-border p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">Games</h2>
        <span class="text-sm text-muted-500">{{ games.length }}</span>
      </div>
      <div class="space-y-2 max-h-[calc(100vh-160px)] overflow-auto pr-2">
        <button
          class="w-full text-left btn btn-ghost hover:bg-muted-50"
          :class="{ 'bg-primary/10': selectedGame === '' }"
          @click="selectGame('')"
        >
          All
        </button>
        <div v-for="g in games" :key="g.game" class="flex">
          <button
            class="w-full text-left btn btn-ghost hover:bg-muted-50 justify-between"
            :class="{ 'bg-primary/10': selectedGame === g.game }"
            @click="selectGame(g.game)"
          >
            <span>{{ g.game || 'Unknown' }}</span>
            <span class="text-muted-500">{{ g.count }}</span>
          </button>
        </div>
      </div>
    </aside>

    <main class="p-0">
      <RouterView />
    </main>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import { api } from './lib/api';
import { RouterLink, RouterView } from 'vue-router';
import { useClipsStore } from './stores/clips';

type GameRow = { game: string; count: number };
type Clip = {
  id: number;
  filePath: string;
  relPath: string;
  game: string;
  filename: string;
  displayName: string | null;
  extension: string;
  sizeBytes: number;
  fileModifiedAt: string;
};

const games = ref<GameRow[]>([]);
const clipsStore = useClipsStore();
const selectedGame = ref('');
const searchText = ref('');
const loading = ref(false);

async function fetchGames() {
  const data = await api.listGames();
  games.value = data as any;
}

function selectGame(g: string) {
  selectedGame.value = g;
}

async function rescan() {
  loading.value = true;
  try {
    await api.scan();
    await Promise.all([fetchGames(), clipsStore.fetchClips()]);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await fetchGames();
});

watch(selectedGame, (g) => {
  clipsStore.setGame(g);
});

watch(searchText, (q) => {
  clipsStore.setSearch(q);
});
</script>

<style scoped>
</style>


