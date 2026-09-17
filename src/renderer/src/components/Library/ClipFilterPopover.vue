<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import {
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import { useClipsStore } from '@renderer/stores/clips';
import { useTagsStore } from '@renderer/stores/tags';
import { useGamesStore } from '@renderer/stores/games';
import { usePublisher } from '@renderer/composables/clips/usePublisher';

/**
 * Every way of narrowing the library, in one place.
 *
 * The row above this used to carry nine standing controls, with the game
 * filter somewhere else again, in the sidebar. They are three questions, so
 * this is three sections: which tags, which game, and what state. The trigger
 * says how many answers are in force, which is the thing a row of dropdowns
 * could never say: with the panel shut you can still see at a glance that
 * something is hiding clips.
 *
 * ## What combines with what, and why
 *
 * - **Tags are multiple.** `GET /clips` takes a comma separated `tags` and
 *   requires all of them, which is the useful case: "the funny ones from that
 *   squad wipe".
 * - **A game is one.** A clip lives in one folder, so two games at once is a
 *   question with no answer.
 * - **Starred is its own answer, and combines with any publish state.** The
 *   store has always held `starredFilter` and `publishedFilter` as two
 *   independent fields and the API has always taken both at once; it was the
 *   old four-tab row that collapsed them into one value and then had to clear
 *   one whenever the other changed. So "starred and published" was a question
 *   the library could answer and could not be asked.
 * - **Any, Published and Not published are one of three**, because a clip is
 *   published or it is not.
 *
 * ## Three things that are deliberate
 *
 * **Every row in all three sections is the same grid**, `[tick, label,
 * count]`, so the ticks form a column, the labels form a column and the counts
 * form a column down the whole panel, across sections holding different kinds
 * of thing. That is `03-games-list-counts-not-aligned` not happening again.
 *
 * **The tick has a column of its own and is never inserted into flow.** A tick
 * that appears beside a label shifts it by the tick's own width, which turns
 * choosing a filter into the list jumping under the pointer.
 *
 * **Nothing here is applied on Done.** Every row takes effect as it is
 * pressed, and the grid behind the panel updates, so the panel is a place to
 * stand rather than a form to fill in. `Done` closes it and `Clear` empties
 * all three sections at once.
 */
const clipsStore = useClipsStore();
const tagsStore = useTagsStore();
const gamesStore = useGamesStore();
const { isConfigured: publisherConfigured } = usePublisher();

/** `null` is "either", which is the default rather than an option nobody picked. */
const PUBLISH_STATES: Array<{ value: boolean | null; label: string }> = [
  { value: null, label: 'Any' },
  { value: true, label: 'Published' },
  { value: false, label: 'Not published' },
];

const tagCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const tag of tagsStore.items) counts.set(tag.name, tag.clipCount ?? 0);
  return counts;
});

const selectedTags = computed(() => new Set(clipsStore.selectedTags));

/** How many separate answers are in force, for the badge on the trigger. */
const activeCount = computed(() => {
  let n = clipsStore.selectedTags.length;
  if (clipsStore.selectedGame) n += 1;
  if (clipsStore.starredFilter) n += 1;
  if (clipsStore.publishedFilter !== null) n += 1;
  return n;
});

function toggleTag(name: string): void {
  const next = new Set(clipsStore.selectedTags);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  clipsStore.setTags([...next]);
}

function clearAll(): void {
  clipsStore.setTags([]);
  clipsStore.setGame('');
  clipsStore.setStarredFilter(false);
  clipsStore.setPublishedFilter(null);
}

/** One template for every row in the panel, so nothing can drift between sections. */
const ROW =
  'w-full h-8 grid grid-cols-[1rem_1fr_auto] items-center gap-2 px-2 rounded-md text-left ' +
  'text-sm outline-none focus-visible:focus-ring transition-colors duration-150 hover:bg-muted-100';
const HEADING = 'h-8 px-2 flex items-center text-xs font-medium uppercase tracking-label text-muted-400';
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <button
        type="button"
        class="h-9 px-2.5 inline-flex items-center gap-2 rounded-md text-sm outline-none focus-visible:focus-ring transition-colors duration-150 hover:bg-muted-100"
        :class="activeCount ? 'text-foreground font-medium' : 'text-muted-600'"
        title="Narrow the library by tag, game or state"
      >
        <Icon icon="material-symbols:filter-alt-outline" class="size-4 shrink-0 block" />
        <span>Filter</span>
        <!--
          A fixed-height pill with tabular figures, so one answer becoming two
          cannot change the button's height, and going from 9 to 10 cannot
          change its width by a hair.
        -->
        <span
          v-if="activeCount"
          class="h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-accent text-accent-fg font-mono text-[10px] tabular-nums"
        >
          {{ activeCount }}
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="6"
        class="z-50 w-72 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-pop"
      >
        <!-- Tags, any number of them at once. -->
        <section v-if="tagsStore.items.length" class="p-2">
          <h3 :class="HEADING">Filter by tag</h3>
          <button
            v-for="tag in tagsStore.items"
            :key="tag.id"
            type="button"
            :class="[ROW, selectedTags.has(tag.name) ? 'text-foreground' : 'text-muted-600']"
            :aria-pressed="selectedTags.has(tag.name)"
            @click="toggleTag(tag.name)"
          >
            <Icon
              v-if="selectedTags.has(tag.name)"
              icon="material-symbols:check"
              class="size-4 shrink-0 block text-accent-ink"
            />
            <span v-else aria-hidden="true" />
            <span class="truncate">#{{ tag.name }}</span>
            <span class="font-mono text-xs tabular-nums text-muted-400">
              {{ tagCounts.get(tag.name) ?? 0 }}
            </span>
          </button>
        </section>

        <!-- One game, because a clip lives in one folder. -->
        <section v-if="gamesStore.items.length" class="p-2 border-t border-border">
          <h3 :class="HEADING">Game</h3>
          <button
            type="button"
            :class="[ROW, clipsStore.selectedGame ? 'text-muted-600' : 'text-foreground']"
            @click="clipsStore.setGame('')"
          >
            <Icon
              v-if="!clipsStore.selectedGame"
              icon="material-symbols:check"
              class="size-4 shrink-0 block text-accent-ink"
            />
            <span v-else aria-hidden="true" />
            <span class="truncate">Any game</span>
            <span aria-hidden="true" />
          </button>
          <button
            v-for="game in gamesStore.items"
            :key="game.game"
            type="button"
            :class="[ROW, clipsStore.selectedGame === game.game ? 'text-foreground' : 'text-muted-600']"
            :title="game.displayName || game.game"
            @click="clipsStore.setGame(game.game)"
          >
            <Icon
              v-if="clipsStore.selectedGame === game.game"
              icon="material-symbols:check"
              class="size-4 shrink-0 block text-accent-ink"
            />
            <span v-else aria-hidden="true" />
            <span class="truncate">{{ game.displayName || game.game }}</span>
            <span class="font-mono text-xs tabular-nums text-muted-400">{{ game.clipCount }}</span>
          </button>
        </section>

        <!--
          Starred is its own answer and sits above the rule, because it
          combines with every publish state below it. Putting it in the same
          list would say it does not.
        -->
        <section class="p-2 border-t border-border">
          <h3 :class="HEADING">State</h3>
          <button
            type="button"
            :class="[ROW, clipsStore.starredFilter ? 'text-foreground' : 'text-muted-600']"
            :aria-pressed="clipsStore.starredFilter"
            @click="clipsStore.setStarredFilter(!clipsStore.starredFilter)"
          >
            <Icon
              v-if="clipsStore.starredFilter"
              icon="material-symbols:check"
              class="size-4 shrink-0 block text-accent-ink"
            />
            <span v-else aria-hidden="true" />
            <span class="truncate">Starred</span>
            <span aria-hidden="true" />
          </button>

          <template v-if="publisherConfigured">
            <div class="mx-2 my-1 h-px bg-border" aria-hidden="true"></div>
            <button
              v-for="state in PUBLISH_STATES"
              :key="String(state.value)"
              type="button"
              :class="[ROW, clipsStore.publishedFilter === state.value ? 'text-foreground' : 'text-muted-600']"
              @click="clipsStore.setPublishedFilter(state.value)"
            >
              <Icon
                v-if="clipsStore.publishedFilter === state.value"
                icon="material-symbols:check"
                class="size-4 shrink-0 block text-accent-ink"
              />
              <span v-else aria-hidden="true" />
              <span class="truncate">{{ state.label }}</span>
              <span aria-hidden="true" />
            </button>
          </template>
        </section>

        <!--
          Clear and Done share a height, a padding and a line-height, in one
          row centred on a single axis, which is the rule the OBS banner's two
          actions broke in `02-obs-banner-actions-baseline`.
        -->
        <div class="flex items-center justify-between gap-2 p-2 border-t border-border">
          <button
            type="button"
            class="h-8 px-2 inline-flex items-center rounded-md text-sm text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
            :disabled="!activeCount"
            @click="clearAll"
          >
            Clear
          </button>
          <PopoverClose as-child>
            <button
              type="button"
              class="h-8 px-2 inline-flex items-center rounded-md text-sm font-medium text-foreground hover:bg-muted-100 outline-none focus-visible:focus-ring transition-colors duration-150"
            >
              Done
            </button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
