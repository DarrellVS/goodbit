<script setup lang="ts">
import { ref } from 'vue';
import { useGamesList } from '../../composables/useGamesList';
import { useGamesStore } from '../../stores/games';
import { useToastStore } from '../../stores/toast';
import { updateGameName } from '../../services/games';
import type { Game } from '../../types/game';
import SidebarSectionHeader from './SidebarSectionHeader.vue';
import SidebarShowMore from './SidebarShowMore.vue';
import GameRenameDialog from './GameRenameDialog.vue';
import { Icon } from '@iconify/vue';

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
const gamesStore = useGamesStore();
const toastStore = useToastStore();

const renameDialogOpen = ref(false);
const gameToRename = ref<Game | null>(null);
const isRenameLoading = ref(false);

function toggleShowAll() {
  showAllGames.value = !showAllGames.value;
}

function openRenameDialog(game: Game, event: Event) {
  event.stopPropagation();
  gameToRename.value = game;
  renameDialogOpen.value = true;
}

async function handleGameRenamed(gameName: string, displayName: string | null) {
  isRenameLoading.value = true;
  try {
    await updateGameName(gameName, displayName);
    await gamesStore.fetchGames();
    renameDialogOpen.value = false;
    toastStore.success('Game renamed successfully');
  } catch (error) {
    console.error('Failed to rename game:', error);
    toastStore.error('Failed to rename game');
  } finally {
    isRenameLoading.value = false;
  }
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

      <div
        v-for="game in visibleGames"
        :key="game.game"
        class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group text-left"
        :class="[
          { 'bg-white/10 text-orange-500': activeGame === game.game },
          props.disabled ? 'cursor-not-allowed' : 'hover:bg-white/10'
        ]"
      >
        <button
          class="flex items-center gap-3 min-w-0 flex-1"
          @click="!props.disabled && emit('select-game', game.game)"
        >
          <div class="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
          <span 
            class="font-medium truncate" 
            :title="game.displayName || game.game || 'Unknown'"
          >
            {{ game.displayName || game.game || 'Unknown' }}
          </span>
        </button>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs text-muted-400">{{ game.clipCount }}</span>
          <button
            v-if="!props.disabled"
            class="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity"
            :title="`Rename ${game.displayName || game.game}`"
            @click="openRenameDialog(game, $event)"
          >
            <Icon icon="mdi:pencil" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <SidebarShowMore
        v-if="hasMoreGames"
        :show-all="showAllGames"
        :total-count="games.length"
        :visible-count="5"
        @toggle="!props.disabled && toggleShowAll()"
      />
    </div>
    
    <GameRenameDialog
      v-model:open="renameDialogOpen"
      :game="gameToRename"
      :loading="isRenameLoading"
      @saved="handleGameRenamed"
    />
  </div>
</template>

