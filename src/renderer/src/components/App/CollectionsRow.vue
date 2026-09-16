<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useCollectionManagement } from '../../composables/useCollectionManagement';
import { collectionsRowLayout } from '../../utils/collectionsRow';
import CollectionCard from './CollectionCard.vue';
import type { DragData } from '../../composables/useDragAndDrop';

/**
 * Collections, above the clips.
 *
 * They were in the sidebar, under the games, in a column that also held the
 * navigation, Smart Tags, Stats and Settings. A collection is a view of the
 * library, the same kind of thing as Starred, and one of the few things in this
 * app somebody made by hand, so this is where it goes.
 *
 * Which means it is now in front of the clips, and the row has to earn that.
 * `collectionsRowLayout` holds the rule: four cards, then an offer to show the
 * rest, and two different overflow behaviours either side of that offer. The
 * strip cannot wrap, so a window too narrow for four costs a sideways scroll
 * rather than reflowing the page; the expanded grid wraps, because a strip you
 * scroll for thirty items is worse than a block you look through.
 *
 * Both shapes size a card the same way, `minmax(11rem, 1fr)` over four
 * columns, so showing them all rearranges the cards without resizing them.
 */
const {
  collections,
  showNewCollectionInput: showCreateInput,
  newCollectionName: createInputValue,
  editingCollectionId: editingId,
  editingCollectionName: editingName,
  dragOverCollectionId: dragOverId,
  ...actions
} = useCollectionManagement();

const showAll = ref(false);

const layout = computed(() => collectionsRowLayout(collections.value.length, showAll.value));
const shown = computed(() => collections.value.slice(0, layout.value.visible));
</script>

<template>
  <section aria-labelledby="collections-heading" class="space-y-2">
    <div class="flex items-center gap-2">
      <h2 id="collections-heading" class="text-xs font-semibold text-muted-500">COLLECTIONS</h2>
      <button
        class="rounded p-1 text-muted-500 transition-colors hover:bg-muted-100 hover:text-foreground"
        title="New collection"
        @click="actions.startCreateCollection"
      >
        <Icon icon="material-symbols:add" class="text-sm" />
      </button>
      <button
        v-if="layout.toggleLabel"
        class="ml-auto rounded px-2 py-1 text-xs text-muted-400 transition-colors hover:bg-muted-100 hover:text-foreground"
        @click="showAll = !showAll"
      >
        {{ layout.toggleLabel }}
      </button>
    </div>

    <!--
      A name is asked for first, so say what is being named. A collection is a
      list you make by hand, and clips can sit in several at once.
    -->
    <div v-if="showCreateInput" class="max-w-md space-y-1">
      <input
        v-model="createInputValue"
        placeholder="Name it, then press Enter"
        class="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-orange-500/50"
        @keyup.enter="actions.createCollection"
        @keyup.esc="showCreateInput = false"
      />
      <p class="text-xs text-muted-500">
        A shelf you fill yourself, like "TikTok queue". A clip can sit on several, and nothing
        moves on disk.
      </p>
    </div>

    <!--
      Nothing to show and no sidebar to make one from any more, so the empty
      state is the create button rather than a sentence about one.
    -->
    <button
      v-if="!collections.length && !showCreateInput"
      class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-500 transition-colors hover:border-muted-300 hover:text-foreground"
      @click="actions.startCreateCollection"
    >
      <Icon icon="material-symbols:create-new-folder" class="text-base" />
      <span>Make a collection, then drag clips onto it</span>
    </button>

    <div
      v-else-if="collections.length"
      class="gap-3 overflow-x-auto pb-1"
      :class="layout.flow === 'strip'
        ? 'grid grid-flow-col auto-cols-[minmax(11rem,1fr)]'
        : 'grid grid-cols-[repeat(4,minmax(11rem,1fr))]'"
    >
      <CollectionCard
        v-for="collection in shown"
        :key="collection.id"
        :collection="collection"
        :is-editing="editingId === collection.id"
        :editing-name="editingName"
        :is-drag-over="dragOverId === collection.id"
        @update:editing-name="editingName = $event"
        @save-edit="actions.saveCollectionEdit"
        @cancel-edit="actions.cancelEdit"
        @start-edit="actions.startEditCollection(collection.id, collection.name)"
        @delete="actions.deleteCollection(collection.id, collection.name)"
        @dragover="actions.onDragOver"
        @dragenter="(e: DragEvent) => actions.handleDragEnter(collection.id, e)"
        @dragleave="actions.handleDragLeave"
        @drop="(e: DragEvent) => actions.onDrop(e, (data: DragData) => actions.handleDropOnCollection(collection.id, data))"
      />
    </div>
  </section>
</template>
