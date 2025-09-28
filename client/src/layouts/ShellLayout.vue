<template>
  <div class="h-full grid grid-cols-[300px_1fr] grid-rows-[72px_1fr]">
    <header class="col-span-2 glass border-b border-border flex items-center justify-between px-6">
      <h1 class="text-2xl font-semibold">Clips</h1>
      <div class="flex items-center gap-3">
        <input class="input w-96" v-model="searchText" placeholder="Search name or filename" />
        <button class="btn" @click="rescan" :disabled="isRescanLoading">Rescan</button>
        <button class="btn" v-if="user" @click="logout">Logout</button>
      </div>
    </header>

    <aside class="glass border-r border-border p-4 space-y-4">
      <h2 class="font-semibold">Games <span class="text-sm text-muted-500">({{ gamesStore.items.length }})</span></h2>
      <div class="space-y-2 max-h-[calc(100vh-160px)] overflow-auto pr-2">
        <button
          class="w-full text-left btn btn-ghost hover:bg-muted-50"
          @click="selectGame('')"
        >
          All
        </button>
        <div v-for="g in gamesStore.items" :key="g.game" class="flex">
          <button
            class="w-full text-left btn btn-ghost hover:bg-muted-50"
            @click="selectGame(g.game)"
          >
            <span>{{ g.game || 'Unknown' }}</span>
            <span class="text-muted-500">({{ g.count }})</span>
          </button>
        </div>
      </div>
    </aside>

    <main class="p-0 overflow-hidden">
      <RouterView />
    </main>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch, computed } from 'vue';
import axios from '../axios';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { useAuthStore } from '../stores/auth';
import { useGamesStore } from '../stores/games';

const gamesStore = useGamesStore();
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
    await axios.post('/api/scan');
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
  await gamesStore.fetchGames();
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


