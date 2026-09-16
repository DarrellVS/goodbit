<script setup lang="ts">
import BaseToggle from '../Base/BaseToggle.vue';
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { fetchGames } from '../../services/games';
import { useGameVisibility } from '../../composables/useGameVisibility';
import { useSettingsSearch } from '../../composables/useSettingsSearch';
import type { Game } from '../../types/game';
import AppLoading from '../App/AppLoading.vue';

const { setHidden } = useGameVisibility();
/* The cards here carry their own name from `utils/settingsCatalog.ts`. */
const { settingRing } = useSettingsSearch();

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
    // Hidden games have to be in this list. It is where they get unhidden.
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
  <!--
    This was a settings section of its own, with a heading and no settings in
    it. It is a card at the foot of Watching now: hiding a game is a thing you
    do to your library rather than a thing you configure about games.
  -->
  <section
    data-setting="Hidden games"
    :class="['space-y-4 pt-2 border-t border-border', settingRing('Hidden games')]"
  >
    <div class="pt-4">
      <h3 class="font-medium text-foreground">Hidden games</h3>
      <p class="text-sm text-muted-500 mt-1">
        Hide folders you don't want in your library. The files stay on disk, they just stop showing up
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
          class="w-full pl-10 pr-4 py-2.5 bg-muted-50 text-foreground placeholder:text-muted-400 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
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
      <AppLoading class="text-lg" />
      Loading games...
    </div>

    <div
      v-else-if="!filteredGames.length"
      class="p-6 text-center text-sm text-muted-500 bg-card rounded-lg border border-border"
    >
      {{ search ? 'No games match that search' : 'No games found' }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="game in filteredGames"
        :key="game.game"
        class="flex items-center justify-between p-4 bg-card rounded-lg border border-border"
        :class="{ 'opacity-60': game.hidden }"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-foreground truncate">
              {{ game.displayName || game.game }}
            </span>
            <span
              v-if="game.hidden"
              class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-muted-200 text-muted-600"
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

        <!--
          `BaseToggle`, not a switch of its own.
          
          This was a hand-rolled button with its own knob and its own
          translate, which CLAUDE.md's "one switch component" rule exists to
          prevent, and it is the most-seen switch on the screen because there
          is one per game. The model is inverted deliberately: the row says
          "shown in your library", so on means visible, while the column
          stores `hidden`.
        -->
        <BaseToggle
          :model-value="!game.hidden"
          :label="`Show ${game.game} in your library`"
          :disabled="busy === game.game"
          class="flex-shrink-0"
          @update:model-value="toggle(game)"
        />
      </div>
    </div>
  </section>
</template>
