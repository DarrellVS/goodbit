<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useRouter } from 'vue-router';
import { useClipsStore } from '@renderer/stores/clips';
import { useFormat } from '@renderer/composables/ui/useFormat';
import StatsColumnHead from './StatsColumnHead.vue';

interface GameStat {
  game: string;
  count: number;
  totalSize: number;
  publishedCount: number;
  starredCount: number;
}

defineProps<{ games: GameStat[] }>();

const router = useRouter();
const clipsStore = useClipsStore();
const { formatBytes } = useFormat();

function handleGameClick(game: string): void {
  clipsStore.setGame(game);
  void router.push('/');
}
</script>

<template>
  <section>
    <StatsColumnHead title="Games" />

    <p v-if="games.length === 0" class="py-8 text-sm text-muted-500">No games yet</p>

    <!--
      Rows separated by a hairline above each, not filled boxes inside a
      panel. `.b-list-row` is 12px of padding, a rule, and nothing else.
    -->
    <button
      v-for="game in games"
      :key="game.game"
      type="button"
      class="w-full flex items-center gap-3 py-3 px-0.5 border-t border-border text-left text-sm outline-none focus-visible:focus-ring hover:bg-muted-50 transition-colors duration-150"
      :title="`Show every clip from ${game.game}`"
      @click="handleGameClick(game.game)"
    >
      <span class="flex-1 min-w-0">
        <span class="block truncate">
          <b class="font-medium text-foreground">{{ game.game }}</b>
          <!--
            The space is written out. Vue strips the whitespace between two
            elements on separate lines, so `TestGame` and `3 clips` ran
            together into `TestGame3 clips`.
          -->
          <span class="text-muted-500">&nbsp;{{ game.count }} clips</span>
        </span>
        <span class="block font-mono text-xs text-muted-400 mt-0.5">
          {{ formatBytes(game.totalSize) }} &middot; {{ game.publishedCount }} published &middot;
          {{ game.starredCount }} starred
        </span>
      </span>
      <Icon icon="material-symbols:chevron-right" class="size-4 shrink-0 block text-muted-400" />
    </button>
  </section>
</template>
