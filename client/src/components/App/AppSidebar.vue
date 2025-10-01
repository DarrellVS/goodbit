<script lang="ts" setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useGamesStore } from '../../stores/games';

interface Props {
  activeGame?: string;
}

interface Emits {
  (e: 'logout'): void;
  (e: 'select-game', game: string): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const gamesStore = useGamesStore();
const topGames = computed(() => gamesStore.topGames());
</script>

<template>
  <aside class="w-64 bg-white/5 backdrop-blur-sm border-r border-gray-200 flex flex-col h-full">
    <div class="p-6">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
          <Icon icon="material-symbols:video-library" class="text-white text-lg" />
        </div>
        <h1 class="text-xl font-bold">Filmpje</h1>
      </div>
    </div>

    <nav class="flex-1 px-3 space-y-1">
      <div class="text-xs font-semibold text-muted-400 px-3 mb-2">MAIN MENU</div>
      
      <RouterLink
        to="/"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:video-library" class="text-lg" />
        <span class="font-medium">Library</span>
      </RouterLink>

      <RouterLink
        to="/today"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:schedule" class="text-lg" />
        <span class="font-medium">Today</span>
      </RouterLink>

      <div v-if="topGames.length" class="pt-4">
        <div class="text-xs font-semibold text-muted-400 px-3 mb-2">GAMES</div>
        
        <button
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
          :class="{ 'bg-white/10 text-orange-500': !activeGame }"
          @click="emit('select-game', '')"
        >
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-orange-500" />
            <span class="font-medium">All</span>
          </div>
        </button>

        <button
          v-for="game in topGames"
          :key="game.game"
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
          :class="{ 'bg-white/10 text-orange-500': activeGame === game.game }"
          @click="emit('select-game', game.game)"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
            <span 
              class="font-medium truncate" 
              :title="game.game || 'Unknown'"
            >
              {{ game.game || 'Unknown' }}
            </span>
          </div>
          <span class="text-xs text-muted-400 flex-shrink-0 ml-2">{{ game.count }}</span>
        </button>
      </div>
    </nav>

    <div class="p-3 space-y-1 border-t border-gray-200">
      <RouterLink
        to="/tag-patterns"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:auto-awesome" class="text-lg" />
        <span class="font-medium">Smart Tags</span>
      </RouterLink>
      
      <RouterLink
        to="/stats"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:bar-chart" class="text-lg" />
        <span class="font-medium">Stats</span>
      </RouterLink>
      
      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
        @click="emit('logout')"
      >
        <Icon icon="material-symbols:logout" class="text-lg" />
        <span class="font-medium">Logout</span>
      </button>
    </div>
  </aside>
</template>
