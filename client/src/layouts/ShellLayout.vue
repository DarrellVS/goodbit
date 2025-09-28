<template>
  <div class="h-full grid grid-rows-[72px_1fr]">
    <AppHeader :search="searchText" :rescan-loading="isRescanLoading" :show-logout="!!user" @update:search="(v) => searchText = v" @rescan="rescan" @logout="logout" />

    <main class="p-0 pb-28">
      <RouterView />
    </main>
  </div>

  <AppFloatingFilter :items="gamesStore.items" :active="selectedGame" @select="selectGame" />
</template>

<script lang="ts" setup>
import { onMounted, ref, watch, computed } from 'vue';
import axios from '../axios';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { useAuthStore } from '../stores/auth';
import { useGamesStore } from '../stores/games';
import AppHeader from '../components/App/AppHeader.vue';
import AppFloatingFilter from '../components/App/AppFloatingFilter.vue';

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

// Floating filter moved into AppFloatingFilter, hover gating handled via composable there
</script>
