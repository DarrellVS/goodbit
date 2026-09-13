<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { fetchGames } from '../../services/games';
import { useGameVisibility } from '../../composables/useGameVisibility';
import type { Game } from '../../types/game';

const { setHidden } = useGameVisibility();

const games = ref<Game[]>([]);
const loading = ref(false);
const busy = ref<string | null>(null);
const search = ref('');

const filteredGames = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return games.value;
  return games.value.filter((game) =>
    game.game.toLowerCase().includes(query) ||
    (game.displayName || '').toLowerCase().includes(query)
  );
});

const hiddenCount = computed(() => games.value.filter((g) => g.hidden).length);

async function load(): Promise<void> {
  loading.value = true;
  try {
    // Hidden games have to be in this list — it is where they get unhidden.
    games.value = await fetchGames(true);
  } finally {
    loading.value = false;
  }
}

async function toggle(game: Game): Promise<void> {
  busy.value = game.game;
  try {
    await setHidden(game.game, !game.hidden, game.displayName || game.game);
    game.hidden = !game.hidden;
  } catch {
    // Toast already shown by the composable
  } finally {
    busy.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Games</h2>
      <p class="text-sm text-muted-500">
        Hide folders you don't want in your library — the files stay on disk, they just stop showing up
        in clips, stats and the editor.
      </p>
    </div>

    <div class="flex items-center gap-3">
      <div class="relative flex-1">
        <Icon
          icon="material-symbols:search"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-400"
        />
        <input
          v-model="search"
          type="text"
          placeholder="Search games"
          class="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all dark:border-slate-700"
        />
      </div>
      <span class="text-sm text-muted-500 whitespace-nowrap">
        {{ hiddenCount }} hidden
      </span>
    </div>

    <div
      v-if="loading"
      class="flex items-center gap-2 text-sm text-muted-500 p-4"
    >
      <Icon icon="svg-spinners:180-ring-with-bg" class="text-lg" />
      Loading games...
    </div>

    <div
      v-else-if="!filteredGames.length"
      class="p-6 text-center text-sm text-muted-500 bg-white rounded-lg border border-gray-200 dark:bg-slate-900 dark:border-slate-700"
    >
      {{ search ? 'No games match that search' : 'No games found' }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="game in filteredGames"
        :key="game.game"
        class="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 dark:bg-slate-900 dark:border-slate-700"
        :class="{ 'opacity-60': game.hidden }"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-gray-900 truncate dark:text-slate-100">
              {{ game.displayName || game.game }}
            </span>
            <span
              v-if="game.hidden"
              class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-slate-400"
            >
              Hidden
            </span>
          </div>
          <p class="text-sm text-muted-500 mt-1">
            <span class="font-mono">{{ game.game }}</span>
            <span class="mx-1.5">·</span>
            <span>{{ game.clipCount }} {{ game.clipCount === 1 ? 'clip' : 'clips' }}</span>
          </p>
        </div>

        <button
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
          :class="game.hidden ? 'bg-gray-300' : 'bg-orange-500'"
          :title="game.hidden ? 'Show in library' : 'Hide from library'"
          :disabled="busy === game.game"
          @click="toggle(game)"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform dark:bg-slate-900"
            :class="game.hidden ? 'translate-x-1' : 'translate-x-6'"
          />
        </button>
      </div>
    </div>
  </section>
</template>
