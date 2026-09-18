<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useCollectionManagement } from '@renderer/composables/library/useCollectionManagement';
import { collectionsRowLayout } from '@renderer/utils/collectionsRow';
import CollectionCard from './CollectionCard.vue';
import type { DragData } from '@renderer/composables/editor/useDragAndDrop';

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
      <h2
        id="collections-heading"
        class="text-xs font-medium uppercase tracking-label text-muted-400"
      >
        Collections
      </h2>
      <button
        type="button"
        class="size-6 inline-flex items-center justify-center shrink-0 rounded-sm text-muted-500 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
        title="New collection"
        aria-label="New collection"
        @click="actions.startCreateCollection"
      >
        <Icon icon="material-symbols:add" class="size-4 shrink-0 block" />
      </button>
      <button
        v-if="layout.toggleLabel"
        type="button"
        class="ml-auto h-7 inline-flex items-center rounded-sm px-1 text-sm text-muted-500 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
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
        class="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-hidden focus:ring-2 focus:ring-accent/50"
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
    <!--
      A tile the size of a collection, not a dashed bar the width of the page.

      It is the `+` that sits at the end of a row of collections, standing in
      for the row before there is one, so the empty state is the same shape as
      the thing it is empty of. The sentence moves to the tooltip: a full-width
      dashed box with a sentence in it was the loudest object on a screen whose
      subject is the clips below it.
    -->
    <button
      v-if="!collections.length && !showCreateInput"
      type="button"
      class="flex h-20 w-44 items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm text-muted-500 hover:border-line-strong hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
      title="Make a collection, then add clips to it from a clip's own menu"
      @click="actions.startCreateCollection"
    >
      <Icon icon="material-symbols:add" class="size-4 shrink-0 block" />
      <span>New collection</span>
    </button>

    <div
      v-else-if="collections.length"
      class="gap-3 overflow-x-auto scroll-p-1.5 p-1.5 -m-1.5"
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
