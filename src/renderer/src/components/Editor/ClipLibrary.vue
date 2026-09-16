<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useFormat } from '../../composables/useFormat';
import { useClipGrouping } from '../../composables/useClipGrouping';
import type { Clip } from '../../types/clip';
import type { Game } from '../../types/game';
import type { Tag } from '../../types/tag';
import AppLoading from '../App/AppLoading.vue';

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

const showTagFilter = ref(false);
const tagSearch = ref('');

const addedIds = computed(() => new Set(props.addedClipIds));

const hasFilters = computed(
  () => search.value !== '' || selectedGame.value !== '' || selectedTags.value.length > 0
);

const visibleTags = computed(() => {
  const needle = tagSearch.value.trim().toLowerCase();
  if (!needle) return props.tags;
  return props.tags.filter((tag) => tag.name.toLowerCase().includes(needle));
});

function isAdded(clip: Clip): boolean {
  return addedIds.value.has(clip.id);
}

function toggleTag(name: string): void {
  selectedTags.value = selectedTags.value.includes(name)
    ? selectedTags.value.filter((tag) => tag !== name)
    : [...selectedTags.value, name];
}
</script>

<template>
  <div class="flex flex-col h-full bg-card/60 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
    <div class="shrink-0 px-4 py-3 bg-orange-500/4 border-b border-border flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Icon icon="material-symbols:video-library" class="text-orange-500" />
        Clip Library
      </h3>
      <span class="text-xs text-muted-500">{{ clips.length }}</span>
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
          class="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-card/80 border border-border focus:border-orange-500 focus:outline-hidden focus:ring-1 focus:ring-orange-500/40"
        />
        <button
          v-if="search"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-400 hover:text-muted-700"
          @click="search = ''"
        >
          <Icon icon="material-symbols:close" class="text-sm" />
        </button>
      </div>

      <select
        v-model="selectedGame"
        class="w-full px-2.5 py-2 text-sm rounded-lg bg-card/80 border border-border focus:border-orange-500 focus:outline-hidden focus:ring-1 focus:ring-orange-500/40"
      >
        <option value="">All games</option>
        <option v-for="game in games" :key="game.game" :value="game.game">
          {{ game.displayName || game.game }} ({{ game.clipCount }})
        </option>
      </select>

      <div>
        <button
          class="w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-lg bg-card/80 border transition-colors"
          :class="selectedTags.length ? 'border-orange-500/60 text-orange-700' : 'border-border text-muted-700 hover:border-orange-400'"
          @click="showTagFilter = !showTagFilter"
        >
          <span class="flex items-center gap-1.5">
            <Icon icon="material-symbols:label" class="text-base" />
            {{ selectedTags.length ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}` : 'Filter by tag' }}
          </span>
          <Icon
            :icon="showTagFilter ? 'material-symbols:expand-less' : 'material-symbols:expand-more'"
            class="text-sm"
          />
        </button>

        <div v-if="showTagFilter" class="mt-2 space-y-2">
          <input
            v-model="tagSearch"
            type="search"
            placeholder="Find a tag"
            class="w-full px-2.5 py-1.5 text-sm rounded-md bg-card/80 border border-border focus:border-orange-500 focus:outline-hidden"
          />
          <div class="max-h-32 overflow-y-auto flex flex-wrap gap-1.5">
            <button
              v-for="tag in visibleTags"
              :key="tag.id"
              class="px-2 py-1 rounded-full text-xs font-medium border transition-colors"
              :class="selectedTags.includes(tag.name)
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-card/80 text-muted-700 border-border hover:border-orange-400'"
              @click="toggleTag(tag.name)"
            >
              {{ tag.name }}
            </button>
            <span v-if="visibleTags.length === 0" class="text-xs text-muted-500 px-1">No tags match</span>
          </div>
        </div>
      </div>

      <div v-if="selectedTags.length" class="flex flex-wrap gap-1">
        <button
          v-for="tag in selectedTags"
          :key="tag"
          class="px-2 py-1 rounded-full text-xs font-medium bg-orange-500/15 text-orange-700 border border-orange-500/30 flex items-center gap-1"
          @click="toggleTag(tag)"
        >
          {{ tag }}
          <Icon icon="material-symbols:close" class="text-xs" />
        </button>
      </div>

      <button
        v-if="hasFilters"
        class="w-full py-1.5 text-xs text-muted-600 hover:text-orange-600 transition-colors"
        @click="emit('clear-filters')"
      >
        Clear filters
      </button>
    </div>

    <div v-if="loading && clips.length === 0" class="flex-1 flex items-center justify-center">
      <AppLoading class="text-xl text-orange-400" />
    </div>

    <div v-else-if="clips.length === 0" class="flex-1 flex items-center justify-center px-4">
      <div class="text-center">
        <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-orange-500/16 flex items-center justify-center">
          <Icon icon="material-symbols:search-off" class="text-2xl text-orange-400" />
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
          <Icon icon="material-symbols:label" class="text-orange-500 text-base shrink-0" />
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
          class="w-full group flex items-center gap-2 p-1.5 rounded-lg bg-orange-500/5 hover:bg-card transition-all border border-orange-400/40 hover:border-orange-500/60 cursor-pointer"
          title="Already in the timeline. Click to add another copy"
          @click="emit('add-to-timeline', entry.clip)"
        >
          <div class="relative w-14 h-8 rounded-sm overflow-hidden shrink-0 bg-black">
            <img
              :src="getThumbUrl(entry.clip)"
              :alt="entry.clip.displayName || entry.clip.filename"
              class="w-full h-full object-cover opacity-60"
            />
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/50">
              <Icon icon="material-symbols:add" class="text-base text-orange-600" />
            </div>
          </div>

          <span class="min-w-0 flex-1 text-xs text-muted-600 truncate text-left">
            {{ entry.clip.displayName || entry.clip.filename }}
          </span>

          <span class="flex items-center gap-1 text-[10px] font-medium text-orange-700 shrink-0 pr-1">
            <Icon icon="material-symbols:check-circle" class="text-sm" />
            In timeline
          </span>
        </button>

        <button
          v-else
          class="w-full group relative rounded-lg overflow-hidden bg-card/80 hover:bg-card transition-all border border-border hover:border-orange-500/50 cursor-pointer"
          @click="emit('add-to-timeline', entry.clip)"
        >
          <div class="aspect-video relative">
            <img
              :src="getThumbUrl(entry.clip)"
              :alt="entry.clip.displayName || entry.clip.filename"
              class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-black/20" />

            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-card/40 backdrop-blur-sm">
              <div class="bg-linear-to-r from-orange-500 to-orange-600 rounded-full p-3 shadow-lg shadow-orange-500/30">
                <Icon icon="material-symbols:add" class="text-2xl text-card" />
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
                class="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-700 border border-orange-500/20"
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
        class="w-full py-2.5 rounded-lg text-sm font-medium bg-card/80 border border-border hover:border-orange-500/60 text-muted-700 transition-colors flex items-center justify-center gap-1.5"
        :disabled="loading"
        @click="emit('load-more')"
      >
        <AppLoading v-if="loading" />
        <Icon v-else icon="material-symbols:expand-more" />
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>
