<script setup lang="ts">
import { computed, ref } from 'vue';
import GameArt from '@renderer/components/Game/GameArt.vue';
import { MAX_VISIBLE_GAMES, useGamesList } from '@renderer/composables/library/useGamesList';
import { useGameVisibility } from '@renderer/composables/library/useGameVisibility';
import { useGamesStore } from '@renderer/stores/games';
import { useToastStore } from '@renderer/stores/toast';
import { updateGameName } from '@renderer/services/games';
import type { Game } from '@renderer/types/game';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui';
import SidebarSectionHeader from './SidebarSectionHeader.vue';
import SidebarShowMore from './SidebarShowMore.vue';
import SidebarRow from './SidebarRow.vue';
import GameRenameDialog from '@renderer/components/Game/GameRenameDialog.vue';
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

/**
 * What `All` counts.
 *
 * The row had no count while every row under it did, so the numbers in this
 * list formed a column of three with a gap at the top. Summing the games is
 * right rather than asking the library: this list is the games it is showing,
 * and a hidden game is not in it.
 */
const totalClips = computed(() => games.value.reduce((sum, g) => sum + (g.clipCount ?? 0), 0));

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
  <div v-if="games.length">
    <div
      v-tooltip="{ content: 'This filter is disabled on this page', disabled: !props.disabled, placement: 'right' }"
      :class="{ 'opacity-50 cursor-not-allowed': props.disabled }"
      :style="props.disabled ? 'pointer-events: auto;' : ''"
      class="space-y-0.5"
    >
      <SidebarSectionHeader title="Games" />

      <!--
        `All` is a row of this list, so it is the same component as the rest
        of it. It used to draw its own markup, which is why its label and the
        game labels started at the same x by luck rather than by construction,
        and why it had no trailing column at all: the counts beside it formed
        a column of three and `All`'s own count sat somewhere else entirely.
      -->
      <SidebarRow
        label="All"
        :active="!activeGame"
        :count="totalClips"
        :disabled="props.disabled"
        @select="emit('select-game', '')"
      >
        <template #icon>
          <span class="size-2 rounded-full bg-accent" />
        </template>
      </SidebarRow>

      <SidebarRow
        v-for="game in visibleGames"
        :key="game.game"
        :label="game.displayName || game.game || 'Unknown'"
        :title="game.displayName || game.game || 'Unknown'"
        :active="activeGame === game.game"
        :disabled="props.disabled"
        @select="emit('select-game', game.game)"
      >
        <template #icon>
          <!--
            The game's own icon where Steam has cached one, and the dot the
            sidebar has always used where it has not. Most libraries are a mix
            of both, so neither can be the only case that looks right. Both
            branches sit in the row's own 16px box, so a mixed list is not
            ragged down its left edge.
          -->
          <GameArt :game="game.game" kind="icon" class="size-4 rounded-sm">
            <span class="size-2 rounded-full bg-accent" />
          </GameArt>
        </template>

        <template #trailing>
          <!--
            The count and the row's menu are stacked in one cell and cross-fade.

            They used to swap `hidden` for `inline-flex`, which cannot animate
            and made the menu appear instantly, and `display` is also the one
            property that would let them change the row's width. Both are
            absolutely positioned over the same 24px square now, so only their
            opacity moves. The menu stays visible while it is open or the
            popover loses the thing it is anchored to.
          -->
          <span class="relative inline-flex size-6 items-center justify-end">
            <span
              class="absolute inset-0 inline-flex items-center justify-end font-mono text-xs tabular-nums text-muted-400 transition-opacity duration-150"
              :class="!props.disabled && openMenuGame !== game.game ? 'group-hover:opacity-0' : ''"
              :style="openMenuGame === game.game ? 'opacity:0' : ''"
            >
              {{ game.clipCount }}
            </span>

          <DropdownMenuRoot
            v-if="!props.disabled"
            :open="openMenuGame === game.game"
            @update:open="openMenuGame = $event ? game.game : null"
          >
            <DropdownMenuTrigger
              class="absolute inset-0 inline-flex items-center justify-center rounded-sm text-muted-500 hover:text-foreground outline-none focus-visible:focus-ring transition-opacity duration-150"
              :class="openMenuGame === game.game
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'"
              :title="`More actions for ${game.displayName || game.game}`"
              @click.stop
            >
              <Icon icon="material-symbols:more-horiz" class="size-4 shrink-0 block" />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                class="min-w-[232px] bg-card rounded-md p-1.5 shadow-pop border border-border outline-hidden z-50"
                align="end"
                :side-offset="4"
              >
                <!--
                  Only for a game Steam actually knows. Everything else in this
                  library is a game from another store, or a browser.
                -->
                <DropdownMenuItem
                  v-if="game.steamAppId"
                  class="flex items-center gap-2 px-3 h-9 text-sm rounded-sm hover:bg-muted-100 outline-hidden cursor-pointer select-none text-foreground"
                  @click="playOnSteam(game)"
                >
                  <Icon icon="mdi:steam" class="size-4 shrink-0 block" />
                  <span>Play on Steam</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="flex items-center gap-2 px-3 h-9 text-sm rounded-sm hover:bg-muted-100 outline-hidden cursor-pointer select-none text-foreground"
                  @click="openRenameDialog(game)"
                >
                  <Icon icon="mdi:pencil" class="size-4 shrink-0 block" />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="flex items-center gap-2 px-3 h-9 text-sm rounded-sm hover:bg-muted-100 outline-hidden cursor-pointer select-none text-foreground"
                  @click="hideGame(game)"
                >
                  <Icon icon="mdi:eye-off-outline" class="size-4 shrink-0 block" />
                  <span>Hide from library</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
          </span>
        </template>
      </SidebarRow>

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

