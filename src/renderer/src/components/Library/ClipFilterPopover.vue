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
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import type { ComboBoxOption } from '@renderer/components/Base/types';

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
 * - **Games are multiple, and whose they are depends on where this is.** A
 *   *clip* lives in one folder, which is not the same statement as a *filter*
 *   holding one: "the Battlefield and Ready Or Not clips from that evening"
 *   was a question the library could answer and could not be asked. The list
 *   comes in as a prop rather than off the clips store, because a collection
 *   has its own: it is a list somebody put together by hand, so opening one
 *   must not silently show the part of it that was recorded in whatever game
 *   the sidebar happened to be on.
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
 * **A list you can read at a glance, or a dropdown and the answer.** State is
 * four fixed options, so it is four rows on one grid, `[tick, label, count]`,
 * with the ticks, the labels and the counts each in a column of their own.
 * That is `03-games-list-counts-not-aligned` not happening again.
 *
 * Tags and games are not four of anything: this library has 54 games, and the
 * panel was a 54 row scroll with two more sections hidden under it. Those two
 * are dropdowns, and what you have chosen is a row of chips directly under the
 * control, at most three of them and then `+2 more`. A chip is both the
 * readback and the way to take one off, which is the thing a closed dropdown
 * reading "3 tags" cannot be.
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
interface Props {
  /** The games in force here, owned by whoever drew this row. */
  selectedGames: string[];
}

interface Emits {
  (e: 'update:selectedGames', games: string[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

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

/** How many separate answers are in force, for the badge on the trigger. */
const activeCount = computed(() => {
  let n = clipsStore.selectedTags.length;
  n += props.selectedGames.length;
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

/** At most this many chips before the rest becomes a number. */
const CHIP_LIMIT = 3;

const tagOptions = computed<ComboBoxOption[]>(() =>
  tagsStore.items.map((tag) => ({
    value: tag.name,
    label: '#' + tag.name,
    count: tag.clipCount ?? 0,
  })),
);

const gameOptions = computed<ComboBoxOption[]>(() =>
  gamesStore.items.map((game) => ({
    value: game.game,
    label: game.displayName || game.game,
    count: game.clipCount,
  })),
);

/** The chips under the tag dropdown: the first three, then how many are left. */
const tagChips = computed(() => clipsStore.selectedTags.slice(0, CHIP_LIMIT));
const tagsBeyondChips = computed(() =>
  Math.max(0, clipsStore.selectedTags.length - CHIP_LIMIT),
);

/** The same three-then-a-number as the tags, for the same reason. */
function gameLabel(name: string): string {
  const game = gamesStore.items.find((item) => item.game === name);
  return game?.displayName || game?.game || name;
}

const gameChips = computed(() => props.selectedGames.slice(0, CHIP_LIMIT));
const gamesBeyondChips = computed(() =>
  Math.max(0, props.selectedGames.length - CHIP_LIMIT),
);

function removeGame(name: string): void {
  emit('update:selectedGames', props.selectedGames.filter((game) => game !== name));
}

function clearAll(): void {
  clipsStore.setTags([]);
  emit('update:selectedGames', []);
  clipsStore.setStarredFilter(false);
  clipsStore.setPublishedFilter(null);
}

/** One template for every row in the panel, so nothing can drift between sections. */
const ROW =
  'w-full h-8 grid grid-cols-[1rem_1fr_auto] items-center gap-2 px-2 rounded-md text-left ' +
  'text-sm outline-none focus-visible:focus-ring transition-colors duration-150 hover:bg-muted-100';
const HEADING = 'h-8 px-2 flex items-center text-xs font-medium uppercase tracking-label text-muted-400';

/** One chip, whatever it is a chip of. */
const CHIP =
  'h-7 pl-2.5 pr-1 inline-flex items-center gap-1 rounded-full border border-border ' +
  'text-sm text-foreground';
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <button
        type="button"
        class="h-8 px-1 inline-flex items-center gap-1.5 rounded-md text-sm outline-none focus-visible:focus-ring transition-colors duration-150"
        :class="activeCount ? 'text-foreground' : 'text-muted-600 hover:text-foreground'"
        title="Narrow the library by tag, game or state"
      >
        <Icon icon="material-symbols:filter-alt-outline" class="size-4 shrink-0 block text-muted-400" />
        <span>Filter</span>
        <!--
          The count is a number in the accent, not a filled pill.

          A pill in a line of plain words is a badge, and a badge says "new" or
          "unread". What this number means is "something is hiding clips from
          you", which the accent says on its own. Tabular and mono so it cannot
          change the trigger's width as it goes from 9 to 10.
        -->
        <span v-if="activeCount" class="font-mono text-xs tabular-nums text-accent-ink">
          {{ activeCount }}
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="6"
        class="z-50 w-80 max-h-[70vh] overflow-y-auto scroll-p-1.5 rounded-lg border border-border bg-card shadow-pop"
      >
        <!-- Tags, any number of them at once. -->
        <section v-if="tagsStore.items.length" class="p-2">
          <h3 :class="HEADING">Filter by tag</h3>
          <div class="px-2 pb-1">
            <BaseComboBox
              block
              variant="quiet"
              label="Filter by tag"
              placeholder="Any tag"
              search-placeholder="Find a tag"
              empty-message="No tags yet. Tag a clip and it turns up here."
              multiple
              :searchable="tagsStore.items.length > 8"
              :model-value="clipsStore.selectedTags"
              :options="tagOptions"
              :summary="(chosen) => `${chosen.length} tags`"
              @update:model-value="(value) => clipsStore.setTags((value as string[]) ?? [])"
            />

            <!--
              What is in force, under the control that set it, and each chip is
              how you take that one off again. Three, then a number: a filter
              that wraps to four lines has stopped being a readback.
            -->
            <div v-if="tagChips.length" class="flex flex-wrap items-center gap-1.5 mt-2">
              <span v-for="tag in tagChips" :key="tag" :class="CHIP">
                <span class="truncate max-w-[9rem]">#{{ tag }}</span>
                <button
                  type="button"
                  class="size-5 shrink-0 inline-flex items-center justify-center rounded-full text-muted-400 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
                  :aria-label="`Stop filtering by ${tag}`"
                  @click="toggleTag(tag)"
                >
                  <Icon icon="material-symbols:close" class="size-3.5 shrink-0 block" />
                </button>
              </span>
              <span v-if="tagsBeyondChips" class="text-sm text-muted-400">
                +{{ tagsBeyondChips }} more
              </span>
            </div>
          </div>
        </section>

        <!-- Any number of games, the same as the tags above. -->
        <section v-if="gamesStore.items.length" class="p-2 border-t border-border">
          <h3 :class="HEADING">Games</h3>
          <div class="px-2 pb-1">
            <BaseComboBox
              block
              variant="quiet"
              label="Filter by game"
              placeholder="Any game"
              search-placeholder="Find a game"
              empty-message="No game by that name."
              multiple
              :searchable="gamesStore.items.length > 8"
              :model-value="props.selectedGames"
              :options="gameOptions"
              :summary="(chosen) => `${chosen.length} games`"
              @update:model-value="(value) => emit('update:selectedGames', (value as string[]) ?? [])"
            />

            <div v-if="gameChips.length" class="flex flex-wrap items-center gap-1.5 mt-2">
              <span v-for="game in gameChips" :key="game" :class="CHIP">
                <span class="truncate max-w-[11rem]">{{ gameLabel(game) }}</span>
                <button
                  type="button"
                  class="size-5 shrink-0 inline-flex items-center justify-center rounded-full text-muted-400 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
                  :aria-label="`Stop filtering by ${gameLabel(game)}`"
                  @click="removeGame(game)"
                >
                  <Icon icon="material-symbols:close" class="size-3.5 shrink-0 block" />
                </button>
              </span>
              <span v-if="gamesBeyondChips" class="text-sm text-muted-400">
                +{{ gamesBeyondChips }} more
              </span>
            </div>
          </div>
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
