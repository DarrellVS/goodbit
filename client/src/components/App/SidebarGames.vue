<script setup lang="ts">
import { useGamesList } from '../../composables/useGamesList';
import SidebarSectionHeader from './SidebarSectionHeader.vue';
import SidebarShowMore from './SidebarShowMore.vue';

interface Props {
  activeGame?: string;
  disabled?: boolean;
}

interface Emits {
  (e: 'select-game', game: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { games, visibleGames, hasMoreGames, showAllGames } = useGamesList();

function toggleShowAll() {
  showAllGames.value = !showAllGames.value;
}
</script>

<template>
  <div 
    v-if="games.length" 
    class="pt-4"
  >
    <div
      v-tooltip="{ content: 'This filter is disabled on this page', disabled: !props.disabled, placement: 'right' }"
      :class="{ 'opacity-50 cursor-not-allowed': props.disabled }"
      :style="props.disabled ? 'pointer-events: auto;' : ''"
    >
      <SidebarSectionHeader title="GAMES" />
    
      <button
        class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group text-left"
        :class="[
          { 'bg-white/10 text-orange-500': !activeGame },
          props.disabled ? 'cursor-not-allowed' : 'hover:bg-white/10'
        ]"
        @click="!props.disabled && emit('select-game', '')"
      >
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full bg-orange-500" />
          <span class="font-medium">All</span>
        </div>
      </button>

      <button
        v-for="game in visibleGames"
        :key="game.game"
        class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group text-left"
        :class="[
          { 'bg-white/10 text-orange-500': activeGame === game.game },
          props.disabled ? 'cursor-not-allowed' : 'hover:bg-white/10'
        ]"
        @click="!props.disabled && emit('select-game', game.game)"
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

      <SidebarShowMore
        v-if="hasMoreGames"
        :show-all="showAllGames"
        :total-count="games.length"
        :visible-count="5"
        @toggle="!props.disabled && toggleShowAll()"
      />
    </div>
  </div>
</template>

