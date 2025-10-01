<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import { RouterLink } from 'vue-router';
import { useGamesStore } from '../../stores/games';
import { computed } from 'vue';

defineProps<{ activeGame?: string }>();
const emit = defineEmits<{ (e: 'logout'): void; (e: 'selectGame', game: string): void }>();

const gamesStore = useGamesStore();
const games = computed(() => gamesStore.items);
</script>

<template>
  <aside class="w-64 bg-white/5 backdrop-blur-sm border-r border-border/50 flex flex-col h-full">
    <!-- Logo/Brand -->
    <div class="p-6">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
          <Icon icon="radix-icons:video" class="text-white text-lg" />
        </div>
        <h1 class="text-xl font-bold">Filmpje</h1>
      </div>
    </div>

    <!-- Main Menu -->
    <nav class="flex-1 px-3 space-y-1">
      <div class="text-xs font-semibold text-muted-400 px-3 mb-2">MAIN MENU</div>
      
      <RouterLink
        to="/"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="radix-icons:video" class="text-lg" />
        <span class="font-medium">Library</span>
      </RouterLink>

      <RouterLink
        to="/today"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="radix-icons:clock" class="text-lg" />
        <span class="font-medium">Today</span>
      </RouterLink>

      <!-- Games Section -->
      <div v-if="games.length > 0" class="pt-4">
        <div class="text-xs font-semibold text-muted-400 px-3 mb-2">GAMES</div>
        <button
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
          :class="{ 'bg-white/10 text-orange-500': !activeGame || activeGame === '' }"
          @click="$emit('selectGame', '')"
        >
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-orange-500"></div>
            <span class="font-medium truncate">All</span>
          </div>
        </button>
        <button
          v-for="game in games.slice(0, 5)"
          :key="game.game"
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
          :class="{ 'bg-white/10 text-orange-500': activeGame === game.game }"
          @click="$emit('selectGame', game.game)"
        >
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-orange-500"></div>
            <span class="font-medium truncate">{{ game.game || 'Unknown' }}</span>
          </div>
          <span class="text-xs text-muted-400">{{ game.count }}</span>
        </button>
      </div>
    </nav>

    <!-- Bottom Section -->
    <div class="p-3 space-y-1 border-t border-border/50">
      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
      >
        <Icon icon="radix-icons:gear" class="text-lg" />
        <span class="font-medium">Settings</span>
      </button>
      
      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
        @click="$emit('logout')"
      >
        <Icon icon="radix-icons:exit" class="text-lg" />
        <span class="font-medium">Logout</span>
      </button>
    </div>
  </aside>
</template>

