import { ref, computed, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBatchOperationsStore } from '../stores/batchOperations';
import { useToastStore } from '../stores/toast';
import { useCollectionsStore } from '../stores/collections';
import { useTagsStore } from '../stores/tags';
import { useConfiguration } from './useConfiguration';
import { pluralize } from '../utils/pluralize';
import * as clipsService from '../services/clips';
import type { Clip } from '../types/clip';
import type { BatchOperationResult } from '../services/clips';

interface UseBatchOperationsOptions {
  clips: Ref<Clip[]>;
  onClipsUpdated: () => Promise<void>;
  collectionId?: number;
}

function getValidClipIds(clips: Clip[]): number[] {
  return clips
    .map(clip => clip.id)
    .filter(id => Number.isFinite(id) && id > 0);
}

function exitAndCleanup(batchStore: ReturnType<typeof useBatchOperationsStore>) {
  batchStore.deselectAll();
  batchStore.exitSelectionMode();
}

function handleBatchResult(
  result: BatchOperationResult,
  toastStore: ReturnType<typeof useToastStore>,
  actionPastTense: string,
) {
  if (result.failed > 0) {
    toastStore.warning(
      `${result.success} ${actionPastTense}, ${result.failed} failed`,
      `Batch ${actionPastTense} completed with errors`
    );
    if (result.errors) {
      console.error(`Batch ${actionPastTense} errors:`, result.errors);
    }
  } else {
    toastStore.success(
      `${result.success} ${pluralize(result.success, 'clip')} ${actionPastTense} successfully`
    );
  }
}

export function useBatchOperations(options: UseBatchOperationsOptions) {
  const router = useRouter();
  const batchStore = useBatchOperationsStore();
  const toastStore = useToastStore();
  const collectionsStore = useCollectionsStore();
  const tagsStore = useTagsStore();
  const config = useConfiguration();

  const showTagDialog = ref(false);
  const showCollectionDialog = ref(false);
  const isProcessing = ref(false);

  const selectedClips = computed(() => 
    batchStore.getSelectedClips(options.clips.value)
  );

  function handleCheckboxClick(clip: Clip, index: number, event: MouseEvent): void {
    if (event.shiftKey && batchStore.selectedCount > 0) {
      batchStore.toggleRange(options.clips.value, index);
    } else {
      batchStore.toggleClip(clip.id, index);
    }
  }

  function handleSelectAll(): void {
    if (batchStore.selectedCount === options.clips.value.length) {
      batchStore.deselectAll();
    } else {
      batchStore.selectAll(options.clips.value);
    }
  }

  async function executeBatchOperation<T extends BatchOperationResult>(
    operation: () => Promise<T>,
    actionName: string,
    actionPastTense: string,
    operationOptions: {
      refreshNeeded?: boolean;
      validateIds?: boolean;
    } = {}
  ): Promise<void> {
    const { refreshNeeded = true, validateIds = false } = operationOptions;
    
    isProcessing.value = true;
    
    try {
      const result = await operation();
      handleBatchResult(result, toastStore, actionPastTense);
      
      exitAndCleanup(batchStore);
      
      if (refreshNeeded) {
        await options.onClipsUpdated();
      }
    } catch (error) {
      console.error(`Batch ${actionName} failed:`, error);
      toastStore.error(`Failed to ${actionName} clips`);
    } finally {
      isProcessing.value = false;
    }
  }

  function handleBatchDelete(): void {
    const count = selectedClips.value.length;
    const clipIds = getValidClipIds(selectedClips.value);

    const performDelete = () =>
      executeBatchOperation(() => clipsService.batchDelete(clipIds), 'delete', 'deleted');

    // Asked the same way a single delete is, and skipped under the same
    // setting — a native `confirm()` blocks the whole renderer.
    if (config.public.value.confirmBeforeDelete) {
      toastStore.confirm(
        `${count} ${pluralize(count, 'clip')} will be moved to the Recycle Bin.`,
        () => void performDelete(),
        'Move to Recycle Bin?'
      );
    } else {
      void performDelete();
    }
  }

  async function handleBatchPublish(): Promise<void> {
    const clipsToPublish = selectedClips.value.filter(clip => !clip.published);
    
    if (clipsToPublish.length === 0) {
      toastStore.info('All selected clips are already published');
      exitAndCleanup(batchStore);
      isProcessing.value = false;
      return;
    }
    
    const clipIds = getValidClipIds(clipsToPublish);
    await executeBatchOperation(
      () => clipsService.batchPublish(clipIds, true),
      'publish',
      'published'
    );
  }

  async function handleBatchUnpublish(): Promise<void> {
    const clipsToUnpublish = selectedClips.value.filter(clip => clip.published);
    
    if (clipsToUnpublish.length === 0) {
      toastStore.info('No selected clips are published');
      exitAndCleanup(batchStore);
      isProcessing.value = false;
      return;
    }
    
    const clipIds = getValidClipIds(clipsToUnpublish);
    await executeBatchOperation(
      () => clipsService.batchPublish(clipIds, false),
      'unpublish',
      'unpublished'
    );
  }

  async function handleBatchStar(): Promise<void> {
    const clipsToStar = selectedClips.value.filter(clip => !clip.starred);
    
    if (clipsToStar.length === 0) {
      toastStore.info('All selected clips are already starred');
      exitAndCleanup(batchStore);
      isProcessing.value = false;
      return;
    }
    
    const clipIds = getValidClipIds(clipsToStar);
    
    if (clipIds.length === 0) {
      toastStore.error('No valid clip IDs found');
      return;
    }
    
    console.log('Batch starring clips:', clipIds);
    await executeBatchOperation(
      () => clipsService.batchStar(clipIds, true),
      'star',
      'starred'
    );
  }

  async function handleBatchUnstar(): Promise<void> {
    const clipsToUnstar = selectedClips.value.filter(clip => clip.starred);
    
    if (clipsToUnstar.length === 0) {
      toastStore.info('No selected clips are starred');
      exitAndCleanup(batchStore);
      isProcessing.value = false;
      return;
    }
    
    const clipIds = getValidClipIds(clipsToUnstar);
    
    if (clipIds.length === 0) {
      toastStore.error('No valid clip IDs found');
      return;
    }
    
    console.log('Batch unstarring clips:', clipIds);
    await executeBatchOperation(
      () => clipsService.batchStar(clipIds, false),
      'unstar',
      'unstarred'
    );
  }

  async function handleBatchAddTags(tags: string[]): Promise<void> {
    const clipIds = getValidClipIds(selectedClips.value);
    
    isProcessing.value = true;
    
    try {
      const result = await clipsService.batchAddTags(clipIds, tags);
      handleBatchResult(result, toastStore, 'tagged');
      
      await tagsStore.fetchTags();
      
      exitAndCleanup(batchStore);
      await options.onClipsUpdated();
    } catch (error) {
      console.error('Batch tag failed:', error);
      toastStore.error('Failed to tag clips');
    } finally {
      isProcessing.value = false;
    }
  }

  async function handleBatchAddToCollection(collectionId: number): Promise<void> {
    isProcessing.value = true;
    
    try {
      const promises = selectedClips.value.map(clip => 
        collectionsStore.addClipToCollection(collectionId, clip.id)
      );
      
      await Promise.all(promises);
      
      const count = selectedClips.value.length;
      toastStore.success(`${count} ${pluralize(count, 'clip')} added to collection`);
      exitAndCleanup(batchStore);
    } catch (error) {
      console.error('Batch add to collection failed:', error);
      toastStore.error('Failed to add some clips to collection');
    } finally {
      isProcessing.value = false;
    }
  }

  function handleBatchRemoveFromCollection(): void {
    if (!options.collectionId) return;

    const count = selectedClips.value.length;

    toastStore.confirm(
      `${count} ${pluralize(count, 'clip')} stay in the library; only this collection loses them.`,
      () => void removeFromCollection(count),
      'Remove from this collection?'
    );
  }

  async function removeFromCollection(count: number): Promise<void> {
    isProcessing.value = true;
    
    try {
      const promises = selectedClips.value.map(clip => 
        collectionsStore.removeClipFromCollection(options.collectionId!, clip.id)
      );
      
      await Promise.all(promises);
      
      toastStore.success(`${count} ${pluralize(count, 'clip')} removed from collection`);
      exitAndCleanup(batchStore);
      await options.onClipsUpdated();
    } catch (error) {
      console.error('Batch remove from collection failed:', error);
      toastStore.error('Failed to remove some clips from collection');
    } finally {
      isProcessing.value = false;
    }
  }

  function handleOpenInEditor(): void {
    // selectedClips follows the order clips are displayed in (newest first),
    // not the order they were clicked, so the timeline matches the library.
    const clipIds = getValidClipIds(selectedClips.value);

    if (clipIds.length === 0) {
      toastStore.error('No valid clips selected');
      return;
    }

    exitAndCleanup(batchStore);
    router.push({ name: 'editor', query: { clips: clipIds.join(',') } });
  }

  return {
    isSelectionMode: computed(() => batchStore.isSelectionMode),
    selectedCount: computed(() => batchStore.selectedCount),
    hasSelection: computed(() => batchStore.hasSelection),
    selectedClips,
    isProcessing,
    showTagDialog,
    showCollectionDialog,
    isSelected: batchStore.isSelected,
    toggleClip: batchStore.toggleClip,
    enterSelectionMode: batchStore.enterSelectionMode,
    exitSelectionMode: batchStore.exitSelectionMode,
    deselectAll: batchStore.deselectAll,
    handleCheckboxClick,
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
  };
}
