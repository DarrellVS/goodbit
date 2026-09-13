<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { GameStats } from '../../composables/useStats';
import { formatBytes } from '../../utils/formatters';
import { useClipsStore } from '../../stores/clips';

interface Props {
  games: GameStats[];
}

defineProps<Props>();

const router = useRouter();
const clipsStore = useClipsStore();

function handleGameClick(gameName: string): void {
  clipsStore.setGame(gameName);
  void router.push('/');
}
</script>

<template>
  <div class="bg-white border border-gray-300 rounded-xl p-6 dark:bg-slate-900 dark:border-slate-700">
    <div class="flex items-center gap-2 mb-4">
      <Icon icon="material-symbols:bar-chart" class="text-xl text-orange-500" />
      <h3 class="text-lg font-semibold">Games</h3>
    </div>
    
    <div v-if="games.length === 0" class="text-center py-12 text-gray-400 dark:text-slate-500">
      No games yet
    </div>
    
    <div v-else class="space-y-2 max-h-96 overflow-y-auto">
      <button
        v-for="game in games"
        :key="game.game"
        class="w-full text-left p-3 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer dark:bg-slate-800"
        @click="handleGameClick(game.game)"
      >
        <div class="flex items-center justify-between mb-1">
          <span class="font-medium text-gray-900 dark:text-slate-100">{{ game.game }}</span>
          <span class="text-sm text-gray-500 dark:text-slate-400">{{ game.count }} clips</span>
        </div>
        <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
          <span>{{ formatBytes(game.totalSize) }}</span>
          <span>{{ game.publishedCount }} published</span>
          <span>{{ game.starredCount }} starred</span>
        </div>
      </button>
    </div>
  </div>
</template>

