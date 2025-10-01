import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCollectionsStore } from '../stores/collections';
import { useToastStore } from '../stores/toast';
import { useDragAndDrop, type DragData } from './useDragAndDrop';

const MAX_VISIBLE_ITEMS = 5;

export function useCollectionManagement() {
  const router = useRouter();
  const route = useRoute();
  const collectionsStore = useCollectionsStore();
  const toastStore = useToastStore();
  const { onDragOver, onDrop } = useDragAndDrop();

  const showNewCollectionInput = ref(false);
  const newCollectionName = ref('');
  const editingCollectionId = ref<number | null>(null);
  const editingCollectionName = ref('');
  const dragOverCollectionId = ref<number | null>(null);
  const showAllCollections = ref(false);

  const collections = computed(() => collectionsStore.items);

  const visibleCollections = computed(() => {
    return showAllCollections.value ? collections.value : collections.value.slice(0, MAX_VISIBLE_ITEMS);
  });

  const hasMoreCollections = computed(() => collections.value.length > MAX_VISIBLE_ITEMS);

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
    toastStore.confirm(
      `This will permanently delete "${name}".`,
      async () => {
        try {
          const isViewingCollection = route.name === 'collection' && Number(route.params.id) === id;
          
          await collectionsStore.deleteCollection(id);
          toastStore.success('Collection deleted');
          
          if (isViewingCollection) {
            await router.push('/');
          }
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
    visibleCollections,
    hasMoreCollections,
    showAllCollections,
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

