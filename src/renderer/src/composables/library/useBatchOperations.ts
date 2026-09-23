import { useCompressionResult } from '@renderer/composables/clips/useCompressionResult';
import { ref, computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBatchOperationsStore } from '@renderer/stores/batchOperations';
import { useToastStore } from '@renderer/stores/toast';
import { useCollectionsStore } from '@renderer/stores/collections';
import { useTagsStore } from '@renderer/stores/tags';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { pluralize } from '@renderer/utils/pluralize';
import * as clipsService from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';
import type { BatchOperationResult } from '@renderer/services/clips';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

interface UseBatchOperationsOptions {
  clips: Ref<Clip[]>;
  onClipsUpdated: () => Promise<void>;
  /**
   * Which collection the clips are being shown in, when they are.
   *
   * Read through `toValue` rather than taken once, because `/collections/:id`
   * keeps the same component across a change of id: a number captured at setup
   * would remove clips from whichever collection was open first.
   */
  collectionId?: MaybeRefOrGetter<number | undefined>;
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
  /** The plain verb, for a headline that has to read as a sentence. */
  actionVerb: string,
) {
  if (result.failed > 0) {
    /*
     * Say what went wrong, in a sentence, and say it the same way the
     * single-clip route does.
     *
     * This read `Batch published completed with errors` over `0 published, 1
     * failed`: broken English, no cause, and no next step. Publishing the same
     * clip from its own panel explained itself properly ("No publisher is set
     * up. Add one under Settings, Connections"), so the identical failure told
     * you two different things depending on which menu you reached it from,
     * and the worse one was on the bulk route.
     *
     * `result.errors` already carried the reason and it was only ever written
     * to the console. The first one is enough: a batch that fails usually
     * fails for one reason, and a toast is not a log.
     */
    const failedClips = `${result.failed} ${pluralize(result.failed, 'clip')}`;
    const headline =
      result.success === 0
        ? `Could not ${actionVerb}${failedClips === '1 clip' ? ' that clip' : ` those ${failedClips}`}`
        : `${result.success} ${actionPastTense}, ${result.failed} could not be`;

    toastStore.warning(result.errors?.[0] ?? `${failedClips} could not be ${actionPastTense}.`, headline);

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
  const compression = useCompressionResult();

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
      handleBatchResult(result, toastStore, actionPastTense, actionName);
      
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
    // setting, a native `confirm()` blocks the whole renderer.
    if (config.public.value.confirmBeforeDelete) {
      confirmAction(
        `${count} ${pluralize(count, 'clip')} will be moved to the Recycle Bin.`,
        () => void performDelete(),
        'Move to Recycle Bin?'
      );
    } else {
      void performDelete();
    }
  }

  /**
   * Squeeze every selected clip, in place.
   *
   * Dispatched one job per clip rather than one job for the batch, because
   * `mediaQueue` is what actually bounds the work: forty jobs become four
   * ffmpegs, and a single job would have to reimplement that limit and its own
   * cancellation on top of it. What the user sees is the jobs list, which
   * already reports progress and an ETA per job.
   *
   * Always confirmed, and not behind `confirmBeforeDelete`: that switch is
   * about deleting, and somebody who turned it off did not thereby agree to
   * have forty recordings re-encoded without being told. The sentence says the
   * part that cannot be undone, which is that the picture is being spent, and
   * the part that can, which is that the originals go to the Recycle Bin.
   */
  function handleBatchCompress(): void {
    const clips = selectedClips.value;
    const count = clips.length;
    const clipIds = getValidClipIds(clips);
    if (!clipIds.length) return;

    confirmAction(
      `${count} ${pluralize(count, 'clip')} will be re-encoded to about a fifth of ` +
        `${count === 1 ? 'its' : 'their'} size, and the picture ` +
        `${count === 1 ? 'it is' : 'they are'} now will be gone. The recordings go to the ` +
        'Recycle Bin, so you can still get the originals back from there. Marks, tags and ' +
        'notes are untouched.',
      () => {
        toastStore.info(
          `${count} ${pluralize(count, 'clip')} queued. Each card updates when it is done.`,
          'Compressing',
        );
        const byId = new Map(clips.map((clip) => [clip.id, clip]));
        // Each one followed to its end, so each card gets its new size and a
        // refusal or a failure is said rather than silently left.
        void Promise.allSettled(
          clipIds.map(async (id) => {
            const { jobId } = await clipsService.compressClip(id);
            const before = byId.get(id);
            if (before) await compression.follow(jobId, before);
          }),
        );
        exitAndCleanup(batchStore);
      },
      `Compress ${count} ${pluralize(count, 'clip')}?`,
      { confirmLabel: 'Compress', tone: 'danger' },
    );
  }

  /**
   * Shrink the published copies, leaving the recordings alone.
   *
   * Only the clips that are actually published, because the rest have no
   * public copy to shrink and asking about them would be a question with a
   * wrong number in it.
   *
   * One request rather than one per clip, unlike the local compress above: the
   * server runs them serially with a pause, because every one is a real
   * Cloudflare purge and forty at once is forty purges in a second.
   */
  function handleBatchCompressPublished(): void {
    const published = selectedClips.value.filter((clip) => clip.published);
    const count = published.length;

    if (!count) {
      toastStore.info('None of the selected clips is published');
      return;
    }

    confirmAction(
      `The copies behind ${count === 1 ? 'the public link' : 'the public links'} are replaced ` +
        `with share-sized ones, at the same ${count === 1 ? 'address' : 'addresses'}, so links ` +
        'you have already sent keep working. The recordings on your own disk are not touched, ' +
        'so this frees no space here.',
      () => {
        void clipsService
          .batchCompressPublished(getValidClipIds(published))
          .catch((error) => {
            console.error('Could not start:', error);
            toastStore.error('Please try again.', 'Could not start');
          });
        toastStore.info(
          `${count} ${pluralize(count, 'copy', 'copies')} queued, one at a time`,
          'Shrinking the published copies',
        );
        exitAndCleanup(batchStore);
      },
      `Shrink ${count} published ${pluralize(count, 'copy', 'copies')}?`,
      { confirmLabel: 'Shrink them' },
    );
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
      handleBatchResult(result, toastStore, 'tagged', 'tag');
      
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
    const collectionId = toValue(options.collectionId);
    if (!collectionId) return;

    const count = selectedClips.value.length;

    confirmAction(
      `${count} ${pluralize(count, 'clip')} stay in the library; only this collection loses them.`,
      () => void removeFromCollection(collectionId, count),
      'Remove from this collection?'
    );
  }

  async function removeFromCollection(collectionId: number, count: number): Promise<void> {
    isProcessing.value = true;
    
    try {
      const promises = selectedClips.value.map(clip => 
        collectionsStore.removeClipFromCollection(collectionId, clip.id)
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
    handleBatchCompress,
    handleBatchCompressPublished,
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
