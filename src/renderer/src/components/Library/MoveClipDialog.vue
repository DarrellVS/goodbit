<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useGamesStore } from '@renderer/stores/games';
import type { Clip } from '@renderer/types/clip';

interface Props {
  open: boolean;
  clip: Clip | null;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'move', targetGame: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const gamesStore = useGamesStore();
const selectedGame = ref('');
const searchQuery = ref('');

const currentGameDisplayName = computed(() => {
  if (!props.clip) return '';
  const game = gamesStore.items.find(g => g.game === props.clip?.game);
  return game?.displayName || props.clip.game;
});

const availableGames = computed(() => {
  if (!props.clip) return gamesStore.items;
  
  // Exclude current game
  let games = gamesStore.items.filter((game) => game.game !== props.clip?.game);
  
  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    games = games.filter((game) => {
      const displayName = game.displayName || game.game;
      return displayName.toLowerCase().includes(query) || game.game.toLowerCase().includes(query);
    });
  }
  
  return games;
});

const isNewGame = computed(() => {
  if (!searchQuery.value.trim()) return false;
  
  // Check if the search query matches any existing game exactly
  const query = searchQuery.value.trim();
  return !gamesStore.items.some((game) => game.game.toLowerCase() === query.toLowerCase());
});

function handleMove(): void {
  if (selectedGame.value) {
    emit('move', selectedGame.value);
    selectedGame.value = '';
    searchQuery.value = '';
    emit('update:open', false);
  }
}

function handleCancel(): void {
  selectedGame.value = '';
  searchQuery.value = '';
  emit('update:open', false);
}

function selectFromSearch(): void {
  if (searchQuery.value.trim()) {
    selectedGame.value = searchQuery.value.trim();
  }
}

onMounted(() => {
  void gamesStore.fetchGames();
});
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-xl shadow-2xl border border-border w-full max-w-md max-h-[80vh] flex flex-col outline-hidden modal-content-animate"
      >
        <div class="p-6 border-b border-border">
          <DialogTitle class="text-xl font-bold text-foreground mb-1">
            Move Clip to Game
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-600">
            Select the target game folder. The file will be physically moved.
          </DialogDescription>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <!-- Current Game Info -->
          <div v-if="clip" class="p-4 bg-muted-50 rounded-lg border border-border">
            <div class="text-xs text-muted-500 mb-1">Current Game</div>
            <div class="font-medium text-foreground">{{ currentGameDisplayName }}</div>
            <div class="text-xs text-muted-500 mt-2">{{ clip.filename }}</div>
          </div>

          <!-- Game Selector -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-muted-700">
              Target Game
            </label>

            <!-- Search / Create Input -->
            <div class="relative">
              <Icon 
                icon="material-symbols:search" 
                class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-400 text-lg pointer-events-none"
              />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search or create new game..."
                class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                @keydown.enter="selectFromSearch"
              />
            </div>

            <!-- New Game Badge -->
            <div 
              v-if="isNewGame" 
              class="px-3 py-2 bg-green-500/8 border border-green-200 rounded-lg flex items-center gap-2"
            >
              <Icon icon="material-symbols:add-circle" class="text-green-600 text-lg" />
              <span class="text-sm text-green-700">
                Press <kbd class="px-1.5 py-0.5 bg-card border border-green-300 rounded-sm text-xs font-mono">Enter</kbd> to create "<strong>{{ searchQuery.trim() }}</strong>"
              </span>
            </div>
            
            <!-- Game List -->
            <div v-if="availableGames.length === 0 && !searchQuery.trim()" class="text-sm text-muted-500 py-4 text-center">
              No other games available
            </div>

            <div v-else-if="availableGames.length === 0 && searchQuery.trim()" class="text-sm text-muted-500 py-4 text-center">
              No games match your search
            </div>

            <div v-else class="space-y-1 max-h-64 overflow-y-auto">
              <button
                v-for="game in availableGames"
                :key="game.game"
                class="w-full px-3 py-2.5 rounded-lg transition-all text-left flex items-center justify-between group"
                :class="{
                  'bg-orange-500/8 text-orange-700': selectedGame === game.game,
                  'hover:bg-muted-50': selectedGame !== game.game,
                }"
                @click="selectedGame = game.game"
              >
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <div 
                    class="w-2 h-2 rounded-full shrink-0"
                    :class="{
                      'bg-orange-500': selectedGame === game.game,
                      'bg-gray-400': selectedGame !== game.game,
                    }"
                  />
                  <span 
                    class="font-medium truncate"
                    :class="{
                      'text-orange-700': selectedGame === game.game,
                      'text-foreground': selectedGame !== game.game,
                    }"
                    :title="game.displayName || game.game"
                  >
                    {{ game.displayName || game.game }}
                  </span>
                </div>
                <span 
                  class="text-xs shrink-0 ml-2"
                  :class="{
                    'text-orange-600': selectedGame === game.game,
                    'text-muted-400': selectedGame !== game.game,
                  }"
                >
                  {{ game.clipCount }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-border flex items-center justify-end gap-3">
          <DialogClose as-child>
            <button
              class="px-4 py-2 rounded-lg border border-border hover:bg-muted-50 transition-colors font-medium text-muted-700"
              @click="handleCancel"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            class="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 transition-colors font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!selectedGame"
            @click="handleMove"
          >
            Move Clip
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

