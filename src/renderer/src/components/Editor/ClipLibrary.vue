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
  <div class="flex flex-col h-full bg-card/60 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
    <div class="shrink-0 px-4 py-3 bg-accent/4 border-b border-border flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Icon icon="material-symbols:video-library" class="text-accent-ink" />
        Clip Library
      </h3>
      <!--
        `40` beside a library that says "41 clips" reads as a contradiction.
        It was never a total: the list pages, so it is what has loaded, and
        there is a "Load more" at the bottom saying so. The `+` is the smallest
        thing that stops it claiming to be the whole number.
      -->
      <span class="text-xs text-muted-500" :title="hasMore ? 'Loaded so far' : 'All of them'">
        {{ clips.length }}{{ hasMore ? '+' : '' }}
      </span>
    </div>

    <div class="shrink-0 p-3 space-y-2 border-b border-border">
      <div class="relative">
        <Icon
          icon="material-symbols:search"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-400 text-lg pointer-events-none"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Search clips and tags"
          class="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-card/80 border border-border focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent/40"
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
      <BaseComboBox
        label="Filter by game"
        placeholder="All games"
        :model-value="selectedGame"
        :options="gameOptions"
        :searchable="games.length > 8"
        search-placeholder="Find a game"
        @update:model-value="(value) => (selectedGame = (value as string) ?? '')"
      />

      <BaseComboBox
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
        <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-accent/16 flex items-center justify-center">
          <Icon icon="material-symbols:search-off" class="text-2xl text-accent-ink" />
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
        <header class="flex items-center gap-1.5 px-0.5 sticky top-0 z-10 bg-card/85 backdrop-blur-sm py-1 -mx-0.5 rounded-sm">
          <Icon icon="material-symbols:label" class="text-accent-ink text-base shrink-0" />
          <span class="text-sm font-semibold text-foreground truncate">
            {{ getGameDisplayName(group.game) }}
          </span>
          <span class="text-xs text-muted-500 shrink-0">{{ group.displayDate }}</span>
          <span class="ml-auto text-xs font-medium text-muted-500 bg-muted-100 px-2 py-0.5 rounded-full shrink-0">
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
          class="w-full group flex items-center gap-2 p-1.5 rounded-lg bg-accent/5 hover:bg-card transition-all border border-accent/40 hover:border-accent/60 cursor-pointer"
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
              <Icon icon="material-symbols:add" class="text-base text-accent-ink" />
            </div>
          </div>

          <span class="min-w-0 flex-1 text-xs text-muted-600 truncate text-left">
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
          <span class="flex items-center gap-1 text-[10px] font-medium text-muted-500 shrink-0 pr-1">
            <Icon icon="material-symbols:check-circle-outline" class="text-sm" />
            In timeline
          </span>
        </button>

        <button
          v-else
          class="w-full group relative rounded-lg overflow-hidden bg-card/80 hover:bg-card transition-all border border-border hover:border-accent/50 cursor-pointer"
          @click="emit('add-to-timeline', entry.clip)"
        >
          <div class="aspect-video relative">
            <img
              :src="getThumbUrl(entry.clip)"
              :alt="entry.clip.displayName || entry.clip.filename"
              class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-linear-to-t from-video-bed/60 via-transparent to-video-bed/20" />

            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/40 backdrop-blur-sm">
              <div class="bg-accent rounded-full p-3">
                <Icon icon="material-symbols:add" class="text-2xl text-accent-fg" />
              </div>
            </div>
          </div>

          <div class="p-2.5 space-y-1.5">
            <div class="text-sm font-medium text-foreground line-clamp-2 text-left leading-snug">
              {{ entry.clip.displayName || entry.clip.filename }}
            </div>

            <div v-if="entry.clip.tags?.length" class="flex flex-wrap gap-1">
              <span
                v-for="tag in entry.clip.tags.slice(0, 3)"
                :key="tag"
                class="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent-ink border border-accent/20"
              >
                {{ tag }}
              </span>
              <span
                v-if="entry.clip.tags.length > 3"
                class="px-2 py-0.5 rounded-full text-xs font-medium bg-muted-100 text-muted-600"
              >
                +{{ entry.clip.tags.length - 3 }}
              </span>
            </div>

            <div class="text-xs text-muted-600 text-left">
              {{ formatBytes(entry.clip.sizeBytes) }}
            </div>
          </div>
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
