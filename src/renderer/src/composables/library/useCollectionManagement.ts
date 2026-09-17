import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useCollectionsStore } from '@renderer/stores/collections';
import { useToastStore } from '@renderer/stores/toast';
import { useDragAndDrop, type DragData } from '@renderer/composables/editor/useDragAndDrop';
import { useCollectionDetail } from '@renderer/composables/library/useCollectionDetail';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

/**
 * Making, renaming, deleting and dropping clips on a collection.
 *
 * How many of them are drawn is no longer in here. It was, as a cap of five,
 * for the sidebar list that has been replaced by the row of cards above the
 * clips; that row's rule is four and two overflow behaviours, and it lives in
 * `utils/collectionsRow.ts`. Two answers to "how many are visible" in one
 * codebase is how they drift.
 */
export function useCollectionManagement() {
  const { closeIfOpen } = useCollectionDetail();
  const collectionsStore = useCollectionsStore();
  const toastStore = useToastStore();
  const { onDragOver, onDrop } = useDragAndDrop();

  const showNewCollectionInput = ref(false);
  const newCollectionName = ref('');
  const editingCollectionId = ref<number | null>(null);
  const editingCollectionName = ref('');
  const dragOverCollectionId = ref<number | null>(null);

  const collections = computed(() => collectionsStore.items);

  function startCreateCollection() {
    showNewCollectionInput.value = true;
    newCollectionName.value = '';
  }

  async function createCollection() {
    if (!newCollectionName.value.trim()) return;
    try {
      await collectionsStore.createCollection(newCollectionName.value.trim());
      showNewCollectionInput.value = false;
      newCollectionName.value = '';
      toastStore.success('Collection created');
    } catch (error) {
      console.error('Failed to create collection:', error);
      toastStore.error('Failed to create collection');
    }
  }

  function startEditCollection(id: number, name: string) {
    editingCollectionId.value = id;
    editingCollectionName.value = name;
  }

  async function saveCollectionEdit() {
    if (!editingCollectionName.value.trim() || editingCollectionId.value === null) return;
    try {
      await collectionsStore.updateCollection(editingCollectionId.value, editingCollectionName.value.trim());
      editingCollectionId.value = null;
      editingCollectionName.value = '';
      toastStore.success('Collection renamed');
    } catch (error) {
      console.error('Failed to update collection:', error);
      toastStore.error('Failed to update collection');
    }
  }

  function cancelEdit() {
    editingCollectionId.value = null;
    editingCollectionName.value = '';
  }

  async function deleteCollection(id: number, name: string) {
    confirmAction(
      `This will permanently delete "${name}".`,
      async () => {
        try {
          await collectionsStore.deleteCollection(id);
          toastStore.success('Collection deleted');

          /*
           * Close the layer only if it is showing the one that just went.
           *
           * This used to compare the route and push '/', which is no longer
           * either true or necessary: a collection is a layer over the
           * library, so there is nowhere to navigate back to, and deleting a
           * different collection from the row must not shut the one you have
           * open.
           */
          closeIfOpen(id);
        } catch (error) {
          console.error('Failed to delete collection:', error);
          toastStore.error('Failed to delete collection');
        }
      },
      'Delete collection?'
    );
  }

  async function handleDropOnCollection(collectionId: number, data: DragData) {
    if (data.type === 'clip') {
      try {
        await collectionsStore.addClipToCollection(collectionId, data.clipId);
        toastStore.success('Clip added to collection');
      } catch (error) {
        console.error('Failed to add clip to collection:', error);
        toastStore.error('Failed to add clip to collection');
      }
    }
    dragOverCollectionId.value = null;
  }

  function handleDragEnter(collectionId: number, event: DragEvent) {
    event.preventDefault();
    dragOverCollectionId.value = collectionId;
  }

  function handleDragLeave(event: DragEvent) {
    const target = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as Node | null;
    
    if (!relatedTarget || !target.contains(relatedTarget)) {
      dragOverCollectionId.value = null;
    }
  }

  watch(editingCollectionId, async (newId) => {
    if (newId !== null) {
      await nextTick();
      const input = document.querySelector(`input[data-collection-edit="${newId}"]`) as HTMLInputElement;
      input?.focus();
      input?.select();
    }
  });

  onMounted(() => {
    void collectionsStore.fetchCollections();
  });

  return {
    collections,
    showNewCollectionInput,
    newCollectionName,
    editingCollectionId,
    editingCollectionName,
    dragOverCollectionId,
    startCreateCollection,
    createCollection,
    startEditCollection,
    saveCollectionEdit,
    cancelEdit,
    deleteCollection,
    handleDropOnCollection,
    handleDragEnter,
    handleDragLeave,
    onDragOver,
    onDrop,
  };
}

