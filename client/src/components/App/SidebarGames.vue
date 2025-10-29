<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useGamesList } from '../../composables/useGamesList';
import SidebarSectionHeader from './SidebarSectionHeader.vue';
import SidebarShowMore from './SidebarShowMore.vue';
import RenameGameDialog from './RenameGameDialog.vue';

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

const isRenameDialogOpen = ref(false);
const selectedGameForRename = ref<{ name: string; count: number } | null>(null);

function toggleShowAll() {
  showAllGames.value = !showAllGames.value;
}

function openRenameDialog(gameName: string, count: number) {
  selectedGameForRename.value = { name: gameName, count };
  isRenameDialogOpen.value = true;
}

function handleRenamed(oldName: string, newName: string) {
  // If the renamed game was active, update the active game
  if (props.activeGame === oldName) {
    emit('select-game', newName);
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
        class="relative group/game-item"
      >
        <button
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left"
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

        <button
          v-if="!props.disabled"
          class="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded opacity-0 group-hover/game-item:opacity-100 hover:bg-white/20 transition-all"
          :title="`Rename ${game.game}`"
          @click.stop="openRenameDialog(game.game, game.count)"
        >
          <Icon icon="material-symbols:edit" class="text-sm" />
        </button>
      </div>

      <SidebarShowMore
        v-if="hasMoreGames"
        :show-all="showAllGames"
        :total-count="games.length"
        :visible-count="5"
        @toggle="!props.disabled && toggleShowAll()"
      />
    </div>

    <RenameGameDialog
      v-if="selectedGameForRename"
      :is-open="isRenameDialogOpen"
      :current-name="selectedGameForRename.name"
      :clip-count="selectedGameForRename.count"
      @close="isRenameDialogOpen = false"
      @renamed="handleRenamed"
    />
  </div>
</template>
