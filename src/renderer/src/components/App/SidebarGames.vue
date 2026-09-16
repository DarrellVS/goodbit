<script setup lang="ts">
import { ref } from 'vue';
import GameArt from './GameArt.vue';
import { MAX_VISIBLE_GAMES, useGamesList } from '../../composables/useGamesList';
import { useGameVisibility } from '../../composables/useGameVisibility';
import { useGamesStore } from '../../stores/games';
import { useToastStore } from '../../stores/toast';
import { updateGameName } from '../../services/games';
import type { Game } from '../../types/game';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui';
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

const { games, matching, visibleGames, hasMoreGames, showAllGames, search, showSearch } =
  useGamesList();
const gamesStore = useGamesStore();
const toastStore = useToastStore();
const { setHidden } = useGameVisibility();

// Which row's … menu is open. The trigger only shows on hover, so it has to
// stay visible while the menu is open or the popover loses its anchor.
const openMenuGame = ref<string | null>(null);

const renameDialogOpen = ref(false);
const gameToRename = ref<Game | null>(null);
const isRenameLoading = ref(false);

function toggleShowAll() {
  showAllGames.value = !showAllGames.value;
}

/** Hand the appid to Steam and let Steam decide the rest. */
async function playOnSteam(game: Game) {
  openMenuGame.value = null;
  const result = await window.goodbit?.steamLaunch(game.game);
  if (!result?.launched) {
    toastStore.error('Steam does not know this game.', 'Could not launch');
  }
}

async function hideGame(game: Game) {
  await setHidden(game.game, true, game.displayName || game.game).catch(() => {});
}

function openRenameDialog(game: Game) {
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
          { 'bg-card/10 text-orange-500': !activeGame },
          props.disabled ? 'cursor-not-allowed' : 'hover:bg-card/10'
        ]"
        @click="!props.disabled && emit('select-game', '')"
      >
        <div class="flex items-center gap-3">
          <!-- The same sixteen pixel box every game row uses, so All lines up
               with them rather than sitting two pixels to the left. -->
          <span class="w-4 h-4 flex items-center justify-center shrink-0">
            <span class="w-2 h-2 rounded-full bg-orange-500" />
          </span>
          <span class="font-medium">All</span>
        </div>
      </button>

      <div
        v-for="game in visibleGames"
        :key="game.game"
        class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group text-left"
        :class="[
          { 'bg-card/10 text-orange-500': activeGame === game.game },
          props.disabled ? 'cursor-not-allowed' : 'hover:bg-card/10'
        ]"
      >
        <button
          class="flex items-center gap-3 min-w-0 flex-1"
          @click="!props.disabled && emit('select-game', game.game)"
        >
          <!--
            The game's own icon where Steam has cached one, and the dot the
            sidebar has always used where it has not. Most libraries are a mix
            of both, so neither can be the only case that looks right.
          -->
          <!--
            Both branches occupy the same box, or the rows do not line up: an
            icon is sixteen pixels and the dot is eight, so a mixed list looked
            ragged down the left edge.
          -->
          <span class="w-4 h-4 flex items-center justify-center shrink-0">
            <GameArt :game="game.game" kind="icon" class="w-4 h-4 rounded-sm">
              <span class="w-2 h-2 rounded-full bg-orange-500" />
            </GameArt>
          </span>
          <span 
            class="font-medium truncate" 
            :title="game.displayName || game.game || 'Unknown'"
          >
            {{ game.displayName || game.game || 'Unknown' }}
          </span>
        </button>
        <div class="shrink-0 flex items-center justify-end min-w-[24px]">
          <!-- Count and the … menu occupy the same slot: hovering the row swaps one for the other. -->
          <span
            class="text-xs text-muted-400"
            :class="{ 'group-hover:hidden': !props.disabled, 'hidden': openMenuGame === game.game }"
          >
            {{ game.clipCount }}
          </span>

          <DropdownMenuRoot
            v-if="!props.disabled"
            :open="openMenuGame === game.game"
            @update:open="openMenuGame = $event ? game.game : null"
          >
            <DropdownMenuTrigger
              class="p-1 rounded-sm hover:bg-card/10 outline-hidden"
              :class="openMenuGame === game.game ? 'block bg-card/10' : 'hidden group-hover:block'"
              :title="`More actions for ${game.displayName || game.game}`"
              @click.stop
            >
              <Icon icon="material-symbols:more-horiz" class="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                class="min-w-[180px] bg-card rounded-lg p-1 shadow-lg border border-border outline-hidden z-50"
                align="end"
                :side-offset="4"
              >
                <!--
                  Only for a game Steam actually knows. Everything else in this
                  library is a game from another store, or a browser.
                -->
                <DropdownMenuItem
                  v-if="game.steamAppId"
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-muted-100 outline-hidden cursor-pointer select-none text-foreground"
                  @click="playOnSteam(game)"
                >
                  <Icon icon="mdi:steam" class="text-base" />
                  <span>Play on Steam</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-muted-100 outline-hidden cursor-pointer select-none text-foreground"
                  @click="openRenameDialog(game)"
                >
                  <Icon icon="mdi:pencil" class="text-base" />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-muted-100 outline-hidden cursor-pointer select-none text-foreground"
                  @click="hideGame(game)"
                >
                  <Icon icon="mdi:eye-off-outline" class="text-base" />
                  <span>Hide from library</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>
      </div>

      <SidebarShowMore
        v-if="hasMoreGames"
        :show-all="showAllGames"
        :total-count="games.length"
        :visible-count="MAX_VISIBLE_GAMES"
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

