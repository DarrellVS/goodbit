<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useCollectionsStore } from '@renderer/stores/collections';
import { useClipsStore } from '@renderer/stores/clips';
import { useGamesStore } from '@renderer/stores/games';
import { useCollectionDetail } from '@renderer/composables/library/useCollectionDetail';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useClipHandlers } from '@renderer/composables/clips/useClipHandlers';
import { useBatchOperations } from '@renderer/composables/library/useBatchOperations';
import { useKeyboardShortcuts } from '@renderer/composables/ui/useKeyboardShortcuts';
import { useClipListKeyboardShortcuts } from '@renderer/composables/library/useClipListKeyboardShortcuts';
import { useClipListHandlers } from '@renderer/composables/library/useClipListHandlers';
import { useSelectAllShortcut } from '@renderer/composables/ui/useSelectAllShortcut';
import { scrollToTop } from '@renderer/utils/scroll';
import type { Clip } from '@renderer/types/clip';
import ClipFilters from '@renderer/components/Library/ClipFilters.vue';
import BaseField from '@renderer/components/Base/BaseField.vue';
import ClipsDisplay from '@renderer/components/Library/ClipsDisplay.vue';
import ClipsPaginationControls from '@renderer/components/Library/ClipsPaginationControls.vue';
import FloatingControlsBar from '@renderer/components/Library/FloatingControlsBar.vue';
import BatchTagDialog from '@renderer/components/Library/BatchTagDialog.vue';
import BatchCollectionDialog from '@renderer/components/Library/BatchCollectionDialog.vue';

/**
 * A collection, as a layer over the library rather than a page.
 *
 * It was a route, and the screen said so three times before showing a clip:
 * the shell's own header ("Collection" / "View collection clips"), then a band
 * carrying the actual name on a different ground, then the filter row. Three
 * stacked bars, and only the middle one held anything you could not have
 * guessed. The different ground was the visible symptom; the stacking was the
 * cause.
 *
 * As a layer there is one header, which is the dialog's, so there is no second
 * surface to match and nothing to mismatch. The name is the title, and the
 * filter row lives *in* that header, under the name, where it reads as
 * describing this collection rather than as another bar above the grid.
 *
 * Everything below the header is what the page already did, unchanged: the
 * library's own filter row, the library's own grid, the library's own batch
 * toolbar. A collection is a list of clips and behaves like one.
 */
const { openCollectionId, close } = useCollectionDetail();

const collectionsStore = useCollectionsStore();
const clipsStore = useClipsStore();
const gamesStore = useGamesStore();
const config = useConfiguration();
const { getVideoUrl, getThumbUrl } = useClipHandlers();

const isOpen = computed({
  get: () => openCollectionId.value !== null,
  set: (value: boolean) => {
    if (!value) close();
  },
});

const collectionId = computed(() => openCollectionId.value ?? 0);
const clips = computed(() => collectionsStore.clipsState.items);
const total = computed(() => collectionsStore.clipsState.total);
const loading = computed(() => collectionsStore.clipsState.loading);
const isEmpty = computed(() => !loading.value && !clips.value.length);
const currentPage = computed(() => collectionsStore.clipsState.page);
const totalPages = computed(() => collectionsStore.totalPages);
const collection = computed(() =>
  collectionsStore.items.find((c) => c.id === collectionId.value),
);

/**
 * The layer's own scroller, so the scroll keys move this list.
 *
 * The page version scrolled `main`, which is still there underneath and still
 * scrollable. Leaving the keys pointed at it would scroll the library behind
 * the layer, which is the bug the arrow keys already had.
 */
const scroller = ref<HTMLElement | null>(null);

async function reload(): Promise<void> {
  collectionsStore.resetCollectionClips();
  await Promise.all([
    collectionsStore.fetchCollectionClips(collectionId.value),
    gamesStore.fetchGames(),
  ]);
}

const { handlePageChange, handleClipUpdated, handleClipDeleted } = useClipListHandlers({
  clips,
  onPageChange: (page: number) => collectionsStore.gotoPage(page),
  onClipUpdated: (updatedClip: Clip) => {
    const index = collectionsStore.clipsState.items.findIndex((c) => c.id === updatedClip.id);
    if (index !== -1) {
      collectionsStore.clipsState.items[index] = updatedClip;
    }
  },
  onClipDeleted: reload,
});

const {
  isSelectionMode,
  selectedCount,
  hasSelection,
  selectedClips,
  showTagDialog,
  showCollectionDialog,
  enterSelectionMode,
  exitSelectionMode,
  deselectAll,
  handleSelectAll,
  handleBatchDelete,
  handleBatchPublish,
  handleBatchUnpublish,
  handleBatchStar,
  handleBatchUnstar,
  handleBatchAddTags,
  handleBatchAddToCollection,
  handleBatchRemoveFromCollection,
  handleOpenInEditor,
} = useBatchOperations({
  clips,
  // The one option the library does not pass, and the reason the toolbar grows
  // a Remove from Collection entry. Passed as the ref, since this layer is
  // reused when a different collection is opened.
  collectionId,
  onClipsUpdated: reload,
});

useClipListKeyboardShortcuts({
  toggleViewMode: () => {
    config.public.value.viewMode = config.public.value.viewMode === 'grid' ? 'grouped' : 'grid';
  },
  onPageNext: () => handlePageChange(currentPage.value + 1),
  onPagePrevious: () => handlePageChange(currentPage.value - 1),
  canGoNext: computed(() => collectionsStore.hasNextPage),
  canGoPrevious: computed(() => collectionsStore.hasPreviousPage),
  isLoading: loading,
  isSelectionMode,
  inLayer: true,
  scrollTarget: scroller,
});

useKeyboardShortcuts({
  actions: {
    'exit-selection': () => {
      if (isSelectionMode.value) {
        exitSelectionMode();
      }
    },
  },
});

useSelectAllShortcut({
  clips,
  isSelectionMode,
  enterSelectionMode,
  selectAll: handleSelectAll,
});

/*
 * Fetch on open and on change, not on mount.
 *
 * This component is mounted for the whole life of the shell so it can animate
 * in, which means `onMounted` would fire once, with no collection chosen, and
 * never again.
 */
watch(openCollectionId, (id, was) => {
  if (id === null) {
    // Leave selection mode behind rather than reopening into it later.
    exitSelectionMode();
    return;
  }
  if (id === was) return;

  collectionsStore.resetCollectionClips();
  void collectionsStore.fetchCollectionClips(id);
  void gamesStore.fetchGames();
  scrollToTop(scroller.value, 'auto');
});

watch(
  [
    () => clipsStore.selectedGame,
    () => clipsStore.searchText,
    () => clipsStore.selectedTags,
    () => clipsStore.publishedFilter,
    () => clipsStore.starredFilter,
  ],
  () => {
    if (openCollectionId.value === null) return;
    collectionsStore.resetCollectionClips();
    void collectionsStore.fetchCollectionClips(collectionId.value);
  },
);
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-scrim-modal z-50 backdrop-blur-md modal-overlay-animate" />
      <Transition name="clip-modal" appear>
        <DialogContent
          class="fixed inset-8 z-50 bg-card rounded-lg shadow-pop border border-border flex flex-col outline-hidden overflow-hidden"
          @open-auto-focus="(event: Event) => event.preventDefault()"
        >
          <!--
            One header, carrying the name and the row that describes the list.
            No second surface, so there is no second colour to get wrong.
          -->
          <header class="shrink-0 border-b border-border">
            <div class="flex items-center gap-4 px-6 pt-5">
              <div class="min-w-0 flex-1">
                <DialogTitle class="truncate text-2xl font-bold text-foreground">
                  {{ collection?.name ?? 'Collection' }}
                </DialogTitle>
                <!--
                  Said for a screen reader and not drawn: the count is already
                  on the right of the row below, and printing it twice in one
                  header is what the old page did with the name.
                -->
                <DialogDescription class="sr-only">
                  The clips in this collection, {{ total }} of them.
                </DialogDescription>
              </div>

              <button
                class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-muted-500 hover:text-foreground hover:bg-muted-50 transition-colors"
                aria-label="Close"
                title="Close (Esc)"
                @click="close"
              >
                <Icon icon="material-symbols:close-rounded" class="text-xl" />
              </button>
            </div>

            <ClipFilters
              flush
              :total-count="total"
              :is-selection-mode="isSelectionMode"
              :sortable="false"
              @enter-selection="enterSelectionMode"
              @exit-selection="exitSelectionMode"
            >
              <template #search>
                <!--
                  The shell's search is behind this layer and the list in here
                  answers to it, so without one the only way to search a collection
                  would be to close it first. Same store, same underlined field as
                  the library's, and directly beside the controls it belongs with
                  rather than up in the title row.
                -->
                <BaseField icon="material-symbols:search" class="w-64">
                  <input
                    type="search"
                    :value="clipsStore.searchText"
                    placeholder="Search this collection"
                    class="text-sm"
                    @input="clipsStore.setSearch(($event.target as HTMLInputElement).value)"
                  />
                </BaseField>
              </template>
            </ClipFilters>
          </header>

          <div ref="scroller" class="flex-1 overflow-y-auto scroll-p-1.5">
            <div class="p-6 space-y-6">
              <ClipsDisplay
                :clips="clips"
                :view-mode="config.public.value.viewMode"
                :is-empty="isEmpty"
                :collection-id="collectionId"
                :is-selection-mode="isSelectionMode"
                empty-icon="material-symbols:folder-open"
                empty-title="No clips in this collection"
                empty-description="Drag and drop clips from your library to add them here."
                :get-video-url="getVideoUrl"
                :get-thumb-url="getThumbUrl"
                @clip-updated="handleClipUpdated"
                @clip-deleted="handleClipDeleted"
              />

              <ClipsPaginationControls
                :loading="loading"
                :current-page="currentPage"
                :total-pages="totalPages"
                :total="total"
                :has-clips="clips.length > 0"
                @page-change="handlePageChange"
              />
            </div>
          </div>

          <FloatingControlsBar
            :has-selection="hasSelection"
            :selected-count="selectedCount"
            :selected-clips="selectedClips"
            :collection-id="collectionId"
            @deselect-all="deselectAll"
            @delete="handleBatchDelete"
            @add-to-collection="showCollectionDialog = true"
            @remove-from-collection="handleBatchRemoveFromCollection"
            @publish="handleBatchPublish"
            @unpublish="handleBatchUnpublish"
            @star="handleBatchStar"
            @unstar="handleBatchUnstar"
            @add-tags="showTagDialog = true"
            @open-in-editor="handleOpenInEditor"
          />

          <BatchTagDialog
            v-model:open="showTagDialog"
            :selected-count="selectedCount"
            @add-tags="handleBatchAddTags"
          />

          <BatchCollectionDialog
            v-model:open="showCollectionDialog"
            :selected-count="selectedCount"
            @add-to-collection="handleBatchAddToCollection"
          />
        </DialogContent>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>
