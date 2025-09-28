<template>
  <div class="h-full grid grid-rows-[72px_1fr]">
    <header class="col-span-2 glass border-b border-border flex items-center justify-between px-6">
      <h1 class="text-2xl font-semibold text-gradient">Clips</h1>
      <div class="flex items-center gap-3">
        <input class="input w-96" v-model="searchText" placeholder="Search name or filename" />
        <button class="btn" @click="rescan" :disabled="isRescanLoading">Rescan</button>
        <button class="btn" v-if="user" @click="logout">Logout</button>
      </div>
    </header>

    <main class="p-0 pb-28">
      <RouterView />
    </main>
  </div>

  <!-- Bottom Floating Filter Pill (expands on hover) -->
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[720px] max-w-[92vw] px-4 pointer-events-none">
    <div class="w-full pointer-events-auto" @mouseenter="onPanelEnter" @mouseleave="onPanelLeave">
      <div
        class="glass bg-white/90 dark:bg-black/70 text-foreground border border-border/80 ring-1 ring-border/60 backdrop-blur-lg shadow-card overflow-hidden transition-all duration-300 ease-out rounded-2xl mx-auto"
        :class="panelOpen ? 'w-full' : 'w-[320px]'"
      >
        <div class="flex items-center justify-between px-4 py-2 select-none cursor-pointer mx-auto transition-[width] duration-300"
          :class="panelOpen ? 'w-full' : 'w-[320px]'"
        >
          <div class="flex items-center gap-2">
            <span class="text-sm text-white">Filter</span>
            <span class="font-bold truncate max-w-[16ch] sm:max-w-[22ch] text-white">{{ selectedGame || 'All' }}</span>
          </div>
        </div>

        <div
          class="px-4 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
          :class="panelOpen ? 'max-h-[60vh] opacity-100 pb-3' : 'max-h-0 opacity-0 pb-0'"
          ref="panelContentEl"
          @transitionend="onPanelTransitionEnd"
        >
          <div class="flex flex-wrap gap-2">
            <button class="pill" :class="{ 'pill-active': selectedGame === '' }" @click="selectGame('')">All</button>
            <button
              v-for="g in gamesStore.items"
              :key="g.game"
              class="pill"
              :class="{ 'pill-active': selectedGame === g.game }"
              @click="selectGame(g.game)"
            >
              <span class="truncate max-w-[16ch] sm:max-w-[22ch]">{{ g.game || 'Unknown' }}</span>
              <span class="text-muted-500 ml-2">{{ g.count }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
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
const panelOpen = ref(false);
const desiredOpen = ref(false);
const isAnimating = ref(false);
const panelContentEl = ref<HTMLDivElement | null>(null);

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

function onPanelEnter() {
  desiredOpen.value = true;
  tryStartTransition();
}

function onPanelLeave() {
  desiredOpen.value = false;
  tryStartTransition();
}

function tryStartTransition() {
  if (isAnimating.value) return;
  if (panelOpen.value === desiredOpen.value) return;
  panelOpen.value = desiredOpen.value;
  isAnimating.value = true;
}

function onPanelTransitionEnd(e: TransitionEvent) {
  if (e.target !== panelContentEl.value) return;
  if (e.propertyName !== 'max-height' && e.propertyName !== 'opacity') return;
  // Allow new transitions only after the current one finishes
  isAnimating.value = false;
  // Start any queued transition
  tryStartTransition();
}
</script>
