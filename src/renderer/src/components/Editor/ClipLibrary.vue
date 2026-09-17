<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { useClipGrouping } from '@renderer/composables/library/useClipGrouping';
import type { Clip } from '@renderer/types/clip';
import type { Game } from '@renderer/types/game';
import type { Tag } from '@renderer/types/tag';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import type { ComboBoxOption } from '@renderer/components/Base/types';

interface Props {
  clips: Clip[];
  getThumbUrl: (clip: Clip) => string;
  games: Game[];
  tags: Tag[];
  loading?: boolean;
  hasMore?: boolean;
  /** Clip ids currently on the timeline; shown muted here. */
  addedClipIds?: number[];
}

interface Emits {
  (e: 'add-to-timeline', clip: Clip): void;
  (e: 'load-more'): void;
  (e: 'clear-filters'): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  hasMore: false,
  addedClipIds: () => [],
});
const emit = defineEmits<Emits>();

const search = defineModel<string>('search', { required: true });
const selectedGame = defineModel<string>('selectedGame', { required: true });
const selectedTags = defineModel<string[]>('selectedTags', { required: true });

const { formatBytes } = useFormat();
const { groupedClips, getGameDisplayName } = useClipGrouping(computed(() => props.clips));

/** One row for every clip in this list, whether or not it is on the timeline. */
const ROW =
  'w-full group flex items-center gap-2.5 p-1.5 rounded-sm text-left ' +
  'hover:bg-muted-50 outline-none focus-visible:focus-ring ' +
  'transition-colors duration-150 cursor-pointer';

const addedIds = computed(() => new Set(props.addedClipIds));

const hasFilters = computed(
  () => search.value !== '' || selectedGame.value !== '' || selectedTags.value.length > 0
);

/**
 * `All games` is an option of this list, not a label above it.
 *
 * Reka reserves the empty string for "nothing is chosen", so the placeholder
 * carries the words and the value stays `''`, which is what the query wants.
 */
const gameOptions = computed<ComboBoxOption[]>(() =>
  props.games.map((game) => ({
    value: game.game,
    label: game.displayName || game.game,
    count: game.clipCount,
  })),
);

const tagOptions = computed<ComboBoxOption[]>(() =>
  props.tags.map((tag) => ({ value: tag.name, label: tag.name })),
);

function tagSummary(selected: ComboBoxOption[]): string {
  if (selected.length === 1) return selected[0].label;
  return `${selected.length} tags`;
}

function isAdded(clip: Clip): boolean {
  return addedIds.value.has(clip.id);
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!--
      No heading over this list. The tab above it says `Clips`, which is the
      same word, one line higher, in a panel that holds nothing else.
    -->
    <div class="shrink-0 pb-3 space-y-3">
      <div class="relative">
        <Icon
          icon="material-symbols:search"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-400 text-lg pointer-events-none"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Search clips and tags"
          class="w-full h-9 pl-8 pr-8 text-sm bg-transparent border-b border-line-strong focus:border-accent focus:outline-none transition-colors duration-150"
        />
        <button
          v-if="search"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-400 hover:text-muted-700"
          @click="search = ''"
        >
          <Icon icon="material-symbols:close" class="text-sm" />
        </button>
      </div>

      <!--
        Two dropdowns, one component, one height.

        The games filter was a bare `<select>` sitting directly above the tag
        filter, so this panel showed a control drawn by Windows and a control
        drawn by the app, one under the other, differing in height, font,
        chevron weight and focus ring. That pair is `07-editor-filter-
        dropdowns`, and CLAUDE.md has had the rule since `BaseComboBox` was
        written: there is one dropdown component.

        Both reserve a leading icon so their labels start at the same x, which
        is the other half of that example.
      -->
      <!--
        One row, because they are one question asked twice and the panel is
        300px wide: stacked, they were two thirds of the space above the list
        they narrow.
      -->
      <div class="flex items-center gap-3">
        <BaseComboBox
          variant="quiet"
          label="Filter by game"
          placeholder="All games"
          :model-value="selectedGame"
          :options="gameOptions"
          :searchable="games.length > 8"
          search-placeholder="Find a game"
          @update:model-value="(value) => (selectedGame = (value as string) ?? '')"
        />

        <BaseComboBox
          variant="quiet"
          label="Filter by tag"
          placeholder="Filter by tag"
          search-placeholder="Find a tag"
          empty-message="No tags yet. Tag a clip and it turns up here."
          multiple
          searchable
          :model-value="selectedTags"
          :options="tagOptions"
          :summary="tagSummary"
          @update:model-value="(value) => (selectedTags = (value as string[]) ?? [])"
        />
      </div>

      <button
        v-if="hasFilters"
        type="button"
        class="w-full h-9 text-sm text-muted-500 hover:text-foreground rounded-md hover:bg-muted-100 outline-none focus-visible:focus-ring transition-colors duration-150"
        @click="emit('clear-filters')"
      >
        Clear filters
      </button>
    </div>

    <div v-if="loading && clips.length === 0" class="flex-1 flex items-center justify-center">
      <BaseSpinner class="text-xl text-accent-ink" />
    </div>

    <div v-else-if="clips.length === 0" class="flex-1 flex items-center justify-center px-4">
      <div class="text-center">
        <div class="mb-3 flex items-center justify-center">
          <Icon icon="material-symbols:search-off" class="size-8 shrink-0 block text-muted-300" />
        </div>
        <p class="text-sm font-medium text-muted-700">No clips found</p>
        <p class="text-xs mt-1 text-muted-500">
          {{ hasFilters ? 'Try a different search or filter' : 'Record something first' }}
        </p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-3 space-y-5">
      <section
        v-for="group in groupedClips"
        :key="`${group.date}-${group.game}`"
        class="space-y-2"
      >
        <header class="flex items-center gap-2 sticky top-0 z-10 bg-background py-1.5">
          <span class="text-xs font-medium uppercase tracking-label text-foreground shrink-0">
            {{ group.displayDate }}
          </span>
          <span class="text-sm text-muted-500 truncate">
            {{ getGameDisplayName(group.game) }}
          </span>
          <span class="ml-auto font-mono text-xs tabular-nums text-muted-400 shrink-0">
            {{ group.clips.length }}
          </span>
        </header>

        <!--
          A clip already on the timeline collapses to a single row: it is there to
          be recognised, not browsed, and at full size a handful of them push
          everything still to be picked off the screen.
        -->
        <template v-for="entry in group.clips" :key="entry.clip.id">
        <button
          v-if="isAdded(entry.clip)"
          :class="ROW"
          title="Already in the timeline. Click to add another copy"
          @click="emit('add-to-timeline', entry.clip)"
        >
          <div class="relative w-14 h-8 rounded-sm overflow-hidden shrink-0 bg-video-bed">
            <img
              :src="getThumbUrl(entry.clip)"
              :alt="entry.clip.displayName || entry.clip.filename"
              class="w-full h-full object-cover opacity-60"
            />
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/50">
              <Icon icon="material-symbols:add" class="text-base text-muted-500" />
            </div>
          </div>

          <span class="min-w-0 flex-1 text-sm text-muted-500 truncate text-left">
            {{ entry.clip.displayName || entry.clip.filename }}
          </span>

          <!--
            Muted, because this is a state and not an offer.

            In the accent colour it read as something to press: a reviewer
            seeing it at size took the filled circle for a remove control and
            could not tell whether the badge was telling them the clip was on
            the timeline or offering to take it off. It is also one of five
            orange things competing on this screen, and the one with the least
            claim to the colour.
          -->
          <span class="flex items-center gap-1 text-xs text-muted-400 shrink-0 pr-1">
            <Icon icon="material-symbols:check" class="size-3.5 shrink-0 block" />
            In timeline
          </span>
        </button>

        <!--
          A row, not a card.

          This was a 16:9 still the full width of the panel, a two-line title,
          a row of tag pills, a file size and a filled accent circle on hover:
          about four times the height of the row beside it for a clip that is
          already on the timeline, so the same list drew two completely
          different objects depending on state. One row, one still, one line
          about it.
        -->
        <button
          v-else
          :class="ROW"
          :title="`Add ${entry.clip.displayName || entry.clip.filename} to the timeline`"
          @click="emit('add-to-timeline', entry.clip)"
        >
          <div class="relative w-14 h-8 rounded-sm overflow-hidden shrink-0 bg-video-bed">
            <img
              :src="getThumbUrl(entry.clip)"
              :alt="entry.clip.displayName || entry.clip.filename"
              class="w-full h-full object-cover"
            />
            <div
              class="absolute inset-0 flex items-center justify-center bg-scrim opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            >
              <Icon icon="material-symbols:add" class="size-4 shrink-0 block text-on-video" />
            </div>
          </div>

          <span class="min-w-0 flex-1">
            <span class="block text-sm text-foreground truncate">
              {{ entry.clip.displayName || entry.clip.filename }}
            </span>
            <span class="block font-mono text-xs text-muted-400">
              {{ formatBytes(entry.clip.sizeBytes) }}
            </span>
          </span>
        </button>
        </template>
      </section>

      <button
        v-if="hasMore"
        type="button"
        class="w-full h-9 rounded-md text-sm font-medium border border-border text-muted-600 hover:bg-muted-100 hover:text-foreground inline-flex items-center justify-center gap-2 outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
        :disabled="loading"
        @click="emit('load-more')"
      >
        <BaseSpinner v-if="loading" class="size-4 shrink-0 block" />
        <Icon v-else icon="material-symbols:expand-more" class="size-4 shrink-0 block" />
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>
