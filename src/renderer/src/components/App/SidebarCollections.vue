<script setup lang="ts">
import { useCollectionManagement } from '../../composables/useCollectionManagement';
import SidebarSectionHeader from './SidebarSectionHeader.vue';
import SidebarCreateInput from './SidebarCreateInput.vue';
import SidebarEmptyState from './SidebarEmptyState.vue';
import SidebarCollectionItem from './SidebarCollectionItem.vue';
import SidebarShowMore from './SidebarShowMore.vue';
import type { DragData } from '../../composables/useDragAndDrop';

const {
  collections: items,
  visibleCollections: visibleItems,
  hasMoreCollections: hasMore,
  showAllCollections: showAll,
  showNewCollectionInput: showCreateInput,
  newCollectionName: createInputValue,
  editingCollectionId: editingId,
  editingCollectionName: editingName,
  dragOverCollectionId: dragOverId,
  ...actions
} = useCollectionManagement();
</script>

<template>
  <div class="pt-4">
    <SidebarSectionHeader
      title="COLLECTIONS"
      action-icon="material-symbols:add"
      action-title="New collection"
      @action="actions.startCreateCollection"
    />

    <SidebarCreateInput
      v-if="showCreateInput"
      v-model="createInputValue"
      placeholder="Collection name"
      @submit="actions.createCollection"
      @cancel="showCreateInput = false"
    />

    <SidebarEmptyState
      v-if="!items.length && !showCreateInput"
      icon="material-symbols:folder-off"
      message="No collections yet"
      action-text="Create your first"
      @action="actions.startCreateCollection"
    />

    <SidebarCollectionItem
      v-for="collection in visibleItems"
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

    <SidebarShowMore
      v-if="hasMore"
      :show-all="showAll"
      :total-count="items.length"
      :visible-count="5"
      @toggle="showAll = !showAll"
    />
  </div>
</template>

